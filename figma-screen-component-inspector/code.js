// Screen Component Inspector — main plugin thread.
// Reads the selected screen/frame, identifies component instances within it,
// classifies them via [ds-component] / [ds-atom] tags in their component
// descriptions, and sends a structured summary to the UI. Never mutates
// the document.

figma.showUI(__html__, { width: 420, height: 640 });

var VALID_SCREEN_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'];

var DS_COMPONENT_TAG = '[ds-component]';
var DS_ATOM_TAG = '[ds-atom]';

// Every [bracket] token in the description is treated as a "label" and
// surfaced individually in the UI (e.g. a designer might also write
// [status: stable] or [owner: design-team] alongside the classification
// tags) — classification itself is still driven only by the two
// recognized [ds-component] / [ds-atom] tags.
function extractLabels(description) {
  var matches = (description || '').match(/\[[^\[\]]+\]/g) || [];
  var seen = {};
  var labels = [];
  matches.forEach(function (m) {
    var normalized = m.trim();
    if (!seen[normalized]) {
      seen[normalized] = true;
      labels.push(normalized);
    }
  });
  return labels;
}

function classifyDescription(description) {
  var text = (description || '').toLowerCase();

  var classification = 'Unclassified';
  if (text.indexOf(DS_COMPONENT_TAG) !== -1) classification = 'DS Component';
  else if (text.indexOf(DS_ATOM_TAG) !== -1) classification = 'DS Atom';

  return { classification: classification, tags: extractLabels(description) };
}

// Builds the same kind of link Figma's own "Copy link to selection" (Cmd/Ctrl+L)
// produces: /design/<fileKey>/<fileName>?node-id=<dash-separated-id>. Requires
// figma.fileKey, which the Plugin API only populates for files that have been
// saved/synced to Figma's servers — see README for when this can be null.
function buildFigmaLink(node) {
  var fileKey = null;
  try {
    fileKey = figma.fileKey;
  } catch (e) {
    fileKey = null;
  }
  if (!fileKey) return null;
  var fileName = encodeURIComponent(figma.root.name || 'Untitled');
  var dashNodeId = node.id.replace(/:/g, '-');
  return 'https://www.figma.com/design/' + fileKey + '/' + fileName + '?node-id=' + dashNodeId;
}

// Resolves an instance's underlying component identity, description and
// documentation links. Falls back to the parent component set's data when
// the instance's specific variant has none of its own — variant components
// often carry shared metadata on the set rather than on each variant.
// The set's name is kept separate from the variant's own name (e.g.
// "Size=Large, State=Hover") so the UI can render them as two lines.
async function resolveComponentInfo(instance) {
  var mainComponent = null;
  try {
    mainComponent = await instance.getMainComponentAsync();
  } catch (e) {
    mainComponent = null;
  }
  if (!mainComponent) return null;

  var parent = mainComponent.parent;
  var isInSet = parent && parent.type === 'COMPONENT_SET';

  var description = mainComponent.description || '';
  if (!description.trim() && isInSet) {
    description = parent.description || '';
  }

  var documentationLinks = mainComponent.documentationLinks || [];
  if ((!documentationLinks || documentationLinks.length === 0) && isInSet) {
    documentationLinks = parent.documentationLinks || [];
  }

  return {
    id: mainComponent.id,
    parentSetId: isInSet ? parent.id : null,
    name: isInSet ? parent.name : mainComponent.name,
    variantName: isInSet ? mainComponent.name : null,
    description: description,
    documentationLinks: documentationLinks
  };
}

// Walking up from a text node to the instance that owns it: a nested DS Atom
// instance is treated as transparent (its text is considered part of the
// containing component's own content — atoms are hidden by default in the
// UI, and their text, e.g. a label or icon caption, is usually the whole
// point of showing that component's content at all). Crossing into any
// *other* nested instance (a DS Component or Unclassified one) still stops
// the walk — that nested instance gets its own row and its own content.
function isOwnText(textNode, instanceRoot, instanceClassification) {
  var p = textNode.parent;
  while (p && p.id !== instanceRoot.id) {
    if (p.type === 'INSTANCE' && instanceClassification[p.id] !== 'DS Atom') {
      return false;
    }
    p = p.parent;
  }
  return true;
}

// Reads the actual characters typed into each of an instance's own text
// layers (e.g. a layer still named "Label" whose displayed text was
// overridden to "Service" for this particular instance), looking through
// any nested DS Atom instances per isOwnText above. This is plain
// per-instance content, not something read from the main component.
function extractTextContent(instance, instanceClassification) {
  var textNodes = instance.findAll(function (n) { return n.type === 'TEXT'; });
  var content = [];
  for (var i = 0; i < textNodes.length; i++) {
    if (!isOwnText(textNodes[i], instance, instanceClassification)) continue;
    content.push({ name: textNodes[i].name, characters: textNodes[i].characters });
  }
  return content;
}

// Reads Dev Mode "Dev resources" links (the ones attached via the link/paperclip
// control in the Dev Mode inspect panel) for a batch of node ids. This is a
// separate Figma feature/API from documentationLinks (which comes from the
// component description panel used when publishing to a library), so both
// sources are read and merged. Degrades to an empty result if the API isn't
// available (older Figma client) or the workspace has no Dev Mode access.
async function fetchDevResources(nodeIds) {
  var byNode = {};
  if (!nodeIds.length || typeof figma.getDevResourcesAsync !== 'function') return byNode;
  try {
    var resources = await figma.getDevResourcesAsync({ nodeIds: nodeIds });
    for (var i = 0; i < resources.length; i++) {
      var r = resources[i];
      if (!r || !r.nodeId || !r.url) continue;
      if (!byNode[r.nodeId]) byNode[r.nodeId] = [];
      byNode[r.nodeId].push({ name: r.name || null, url: r.url });
    }
  } catch (e) {
    // No Dev Mode access on this file/plan, or the API isn't supported — ignore.
  }
  return byNode;
}

async function analyzeSelection() {
  var selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'empty', reason: 'no-selection' });
    return;
  }

  if (selection.length > 1) {
    figma.ui.postMessage({ type: 'empty', reason: 'invalid-selection' });
    return;
  }

  var screenNode = selection[0];

  if (VALID_SCREEN_TYPES.indexOf(screenNode.type) === -1 || typeof screenNode.findAll !== 'function') {
    figma.ui.postMessage({ type: 'empty', reason: 'invalid-selection' });
    return;
  }

  // findAll's order is the node tree's children-array order, i.e. z-stacking
  // (back to front) — NOT visual top-to-bottom position. Reordering layers,
  // "bring to front", or pasting can freely scramble it relative to how the
  // screen actually reads, so it cannot be used as "order of appearance".
  // Instead each unique component is sorted below by the on-canvas position
  // (top-to-bottom, then left-to-right) of its topmost occurrence.
  var instances = screenNode.findAll(function (n) { return n.type === 'INSTANCE'; });

  var order = [];
  var byId = {};
  var instanceClassification = {}; // instance.id -> classification, for every instance (incl. nested)
  var resolvedInstances = []; // { node, mainId }, same order as instances

  // Pass 1: resolve identity/classification for every instance found,
  // including nested ones. This has to fully finish before extracting text
  // content (pass 2 below), since a component's own content extraction
  // needs to know the classification of instances nested *inside* it —
  // which may appear later in this array than the component itself.
  for (var i = 0; i < instances.length; i++) {
    var info = await resolveComponentInfo(instances[i]);
    if (!info) continue;

    var box = instances[i].absoluteBoundingBox;
    var posY = box ? box.y : 0;
    var posX = box ? box.x : 0;

    if (!byId[info.id]) {
      var classified = classifyDescription(info.description);
      byId[info.id] = {
        id: info.id,
        parentSetId: info.parentSetId,
        name: info.name,
        variantName: info.variantName,
        count: 0,
        classification: classified.classification,
        tags: classified.tags,
        description: info.description,
        links: info.documentationLinks.map(function (l) { return { name: null, url: l.uri }; }),
        instanceIds: [],
        content: [],
        sortY: posY,
        sortX: posX
      };
      order.push(info.id);
    } else if (posY < byId[info.id].sortY) {
      // Keep the topmost (then leftmost) occurrence's position as the sort key.
      byId[info.id].sortY = posY;
      byId[info.id].sortX = posX;
    }
    byId[info.id].count += 1;
    byId[info.id].instanceIds.push(instances[i].id);
    instanceClassification[instances[i].id] = byId[info.id].classification;
    resolvedInstances.push({ node: instances[i], mainId: info.id });
  }

  // Pass 2: now that every instance's classification is known, extract each
  // occurrence's own text content.
  for (var j = 0; j < resolvedInstances.length; j++) {
    var entry = resolvedInstances[j];
    byId[entry.mainId].content.push(extractTextContent(entry.node, instanceClassification));
  }

  // Batch-fetch Dev Mode links for every unique component (and its variant
  // set, as a fallback) found on the screen, then merge them in.
  var nodeIdSet = {};
  order.forEach(function (id) {
    nodeIdSet[id] = true;
    var setId = byId[id].parentSetId;
    if (setId) nodeIdSet[setId] = true;
  });
  var devResourcesByNode = await fetchDevResources(Object.keys(nodeIdSet));

  order.forEach(function (id) {
    var comp = byId[id];
    var devLinks = devResourcesByNode[id] || [];
    if (!devLinks.length && comp.parentSetId) {
      devLinks = devResourcesByNode[comp.parentSetId] || [];
    }
    comp.links = comp.links.concat(devLinks);
    delete comp.parentSetId;
  });

  var components = order.map(function (id) { return byId[id]; });
  components.sort(function (a, b) {
    if (a.sortY !== b.sortY) return a.sortY - b.sortY;
    return a.sortX - b.sortX;
  });
  components.forEach(function (comp) {
    delete comp.sortY;
    delete comp.sortX;
  });

  figma.ui.postMessage({
    type: 'result',
    screen: {
      name: screenNode.name,
      link: buildFigmaLink(screenNode)
    },
    components: components
  });
}

// Selecting instances from the UI (the target button on each row) changes
// figma.currentPage.selection ourselves, which would otherwise immediately
// re-trigger analyzeSelection via selectionchange and blow away the current
// inventory (since a multi-instance selection isn't a valid single "screen").
// This flag swallows exactly that one self-caused event.
var suppressNextSelectionChange = false;

async function selectInstancesOnCanvas(ids) {
  var nodes = [];
  for (var i = 0; i < ids.length; i++) {
    var node = null;
    try {
      node = await figma.getNodeByIdAsync(ids[i]);
    } catch (e) {
      node = null;
    }
    if (node) nodes.push(node);
  }
  if (!nodes.length) return;

  suppressNextSelectionChange = true;
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
}

figma.on('selectionchange', function () {
  if (suppressNextSelectionChange) {
    suppressNextSelectionChange = false;
    return;
  }
  analyzeSelection();
});

figma.ui.onmessage = function (msg) {
  if (!msg) return;
  if (msg.type === 'refresh') {
    analyzeSelection();
  } else if (msg.type === 'select' && Array.isArray(msg.ids)) {
    selectInstancesOnCanvas(msg.ids);
  }
};

analyzeSelection();
