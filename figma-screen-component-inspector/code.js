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

// The Figma access token lives only in this plugin's own clientStorage —
// local to this machine, never written into any source file, never part
// of what gets committed or shared as the plugin.
var FIGMA_TOKEN_STORAGE_KEY = 'figmaAccessToken';
var FIGMA_TOKEN_SAVED_AT_KEY = 'figmaTokenSavedAt';

// Where the Component Status table lives. Unlike the token, this isn't a
// secret — it's just a pointer — so it's fixed here by whoever maintains
// this plugin rather than something every designer has to go find and
// paste in. STATUS_ROOT_NODE_ID is the stable container the table lives
// under (confirmed directly from the file owner as "always goes to the
// page with the table"); the table's own row/frame ids inside it move
// around as it's regenerated, which is exactly why this points at the
// stable container and then recursively scans everything under it for
// "Row / ..." instances, rather than depending on exact internal
// structure. If this table ever moves to a different file/branch or
// section, update these two constants and redistribute the plugin.
var STATUS_FILE_KEY = '4eG2NdH7jFnPSllUCiSMrV';
var STATUS_ROOT_NODE_ID = '9511:38471';

// Validates a token against Figma's own API (GET /v1/me is the cheapest
// authenticated call — it just returns the token owner's identity) rather
// than guessing from an expiration date we have no way to know: Figma
// doesn't expose a token's own expiry to the token itself, so the only
// reliable signal is "does an authenticated call actually succeed right now".
async function checkFigmaToken(token) {
  try {
    var res = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': token }
    });
    if (!res.ok) {
      var reason = (res.status === 401 || res.status === 403)
        ? 'invalid or expired token'
        : ('Figma API returned HTTP ' + res.status);
      return { ok: false, message: reason };
    }
    var data = await res.json();
    return { ok: true, handle: data.handle, email: data.email };
  } catch (e) {
    return { ok: false, message: 'could not reach Figma — check your connection' };
  }
}

async function sendTokenCheckResult(token) {
  figma.ui.postMessage({ type: 'token-check-result', state: 'checking' });
  var result = await checkFigmaToken(token);
  figma.ui.postMessage({
    type: 'token-check-result',
    state: result.ok ? 'ok' : 'bad',
    handle: result.handle,
    email: result.email,
    message: result.message
  });
}

// ---- Component Status table (cross-file lookup) ----
//
// Reads the "Component Status" page from the separate CO/CO Design
// Library file via Figma's REST API, and parses it into a lookup keyed
// by each row's Component-cell text. Row shape (confirmed against a real
// row's layer tree):
//
//   Row / <name>                  (INSTANCE, name starts with "Row /")
//     Component                     (group) -> two TEXT children: name, type/library
//     Version                       (group) -> one TEXT child: version string
//     COBA iOS / COBA Android /
//     Purple iOS / Purple Android   (group, exact name) ->
//         Status (group) -> two TEXT children: glyph, status label
//         a sibling TEXT (not inside Status) -> "on vX.X.X", only when relevant
//     Link                          (group) -> Go to Component (instance) -> TEXT with a real hyperlink

async function figmaApiGet(path, token) {
  var res = await fetch('https://api.figma.com/v1' + path, {
    headers: { 'X-Figma-Token': token }
  });
  if (!res.ok) {
    var err = new Error('Figma API returned HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function findChildByName(node, name) {
  if (!node || !node.children) return null;
  for (var i = 0; i < node.children.length; i++) {
    if (node.children[i].name === name) return node.children[i];
  }
  return null;
}

// Normalizes a component name for matching between the inspected screen and
// the status table's "Component" cell text: collapses any whitespace around
// "/" (Figma's own variant/grouping separator — "Button / Standard" and
// "Button/Standard" should be the same key), collapses other runs of
// whitespace, and lowercases. This is deliberately forgiving rather than an
// exact 1:1 string match, since the two sources (a live component name vs.
// hand-typed table text) are never guaranteed to be byte-identical.
function normalizeName(str) {
  return (str || '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Fallback for when a row has no group literally named "Version" (or it's
// empty) — scans the whole row for a text layer that looks like a version
// string (e.g. "v1.2.0", "2.3"), since the "versions are stored in a
// different cell" per the plugin admin's own suspicion about this table.
var VERSION_PATTERN = /\bv?\d+(?:\.\d+){1,3}\b/i;
function findVersionFallback(rowNode) {
  var found = '';
  function walk(n) {
    if (found || !n) return;
    if (n.type === 'TEXT' && typeof n.characters === 'string') {
      var text = n.characters.trim();
      if (text.length && text.length < 24 && VERSION_PATTERN.test(text)) {
        found = text;
        return;
      }
    }
    if (n.children) {
      for (var i = 0; i < n.children.length && !found; i++) walk(n.children[i]);
    }
  }
  walk(rowNode);
  return found;
}

function nthTextChild(node, index) {
  if (!node || !node.children) return '';
  var texts = node.children.filter(function (c) { return c.type === 'TEXT'; });
  return texts[index] ? (texts[index].characters || '') : '';
}

function parseBrandPlatformGroup(groupNode) {
  if (!groupNode) return null;
  var statusGroup = findChildByName(groupNode, 'Status');
  var glyph = nthTextChild(statusGroup, 0);
  var label = nthTextChild(statusGroup, 1).trim();

  var note = '';
  if (groupNode.children) {
    for (var i = 0; i < groupNode.children.length; i++) {
      var c = groupNode.children[i];
      if (c !== statusGroup && c.type === 'TEXT') {
        note = (c.characters || '').trim();
        break;
      }
    }
  }
  return { glyph: glyph, label: label, note: note };
}

function parseRowNode(rowNode) {
  var componentGroup = findChildByName(rowNode, 'Component');
  var versionGroup = findChildByName(rowNode, 'Version');
  var linkGroup = findChildByName(rowNode, 'Link');

  var name = nthTextChild(componentGroup, 0).trim();
  if (!name) return null;

  var version = nthTextChild(versionGroup, 0).trim();
  if (!version) version = findVersionFallback(rowNode);

  var link = null;
  if (linkGroup) {
    var goToComponent = findChildByName(linkGroup, 'Go to Component');
    var linkTexts = goToComponent && goToComponent.children ? goToComponent.children : [];
    for (var i = 0; i < linkTexts.length; i++) {
      var t = linkTexts[i];
      if (t.type === 'TEXT' && t.style && t.style.hyperlink && t.style.hyperlink.url) {
        link = t.style.hyperlink.url;
        break;
      }
    }
  }

  return {
    name: name,
    typeLibrary: nthTextChild(componentGroup, 1).trim(),
    version: version,
    link: link,
    brands: {
      coba: {
        ios: parseBrandPlatformGroup(findChildByName(rowNode, 'COBA iOS')),
        android: parseBrandPlatformGroup(findChildByName(rowNode, 'COBA Android'))
      },
      purple: {
        ios: parseBrandPlatformGroup(findChildByName(rowNode, 'Purple iOS')),
        android: parseBrandPlatformGroup(findChildByName(rowNode, 'Purple Android'))
      }
    }
  };
}

// Finds every "Row / ..." instance in the subtree without descending into
// an already-matched row's own children (rows aren't nested in each other,
// but this keeps the walk cheap either way).
function collectRowNodes(node, out) {
  if (!node) return;
  if (node.type === 'INSTANCE' && typeof node.name === 'string' && node.name.indexOf('Row /') === 0) {
    out.push(node);
    return;
  }
  if (node.children) {
    for (var i = 0; i < node.children.length; i++) collectRowNodes(node.children[i], out);
  }
}

async function fetchComponentStatusTable() {
  var token = await figma.clientStorage.getAsync(FIGMA_TOKEN_STORAGE_KEY);
  if (!token) return { error: 'missing-token' };

  var rootDoc;
  try {
    var deep = await figmaApiGet(
      '/files/' + STATUS_FILE_KEY + '/nodes?ids=' + encodeURIComponent(STATUS_ROOT_NODE_ID),
      token
    );
    rootDoc = deep.nodes && deep.nodes[STATUS_ROOT_NODE_ID] && deep.nodes[STATUS_ROOT_NODE_ID].document;
  } catch (e) {
    return { error: 'fetch-failed', message: e.message };
  }
  if (!rootDoc) {
    return {
      error: 'section-not-found',
      debug: { responseHadNodes: !!(deep && deep.nodes), nodeKeysReturned: deep && deep.nodes ? Object.keys(deep.nodes) : [] }
    };
  }

  var rowNodes = [];
  collectRowNodes(rootDoc, rowNodes);

  var byName = {};
  var debugRows = [];
  rowNodes.forEach(function (rowNode) {
    var parsed = parseRowNode(rowNode);
    debugRows.push({ layerName: rowNode.name, parsedName: parsed ? parsed.name : null });
    if (parsed) byName[normalizeName(parsed.name)] = parsed;
  });

  // Surfaced to the UI regardless of outcome so a mismatch (wrong root node,
  // zero rows, or rows that parsed but don't match any on-screen component)
  // can be diagnosed directly from the plugin instead of guessing blind.
  var debug = {
    rootName: rootDoc.name,
    rootType: rootDoc.type,
    rootChildCount: (rootDoc.children || []).length,
    rows: debugRows.slice(0, 300)
  };

  return { byName: byName, count: rowNodes.length, debug: debug };
}

figma.ui.onmessage = async function (msg) {
  if (!msg) return;

  if (msg.type === 'fetch-status-table') {
    try {
      var tableResult = await fetchComponentStatusTable();
      if (tableResult.error) {
        figma.ui.postMessage({ type: 'status-table-error', reason: tableResult.error, message: tableResult.message, debug: tableResult.debug });
      } else {
        figma.ui.postMessage({ type: 'status-table-loaded', byName: tableResult.byName, count: tableResult.count, debug: tableResult.debug });
      }
    } catch (e) {
      figma.ui.postMessage({ type: 'status-table-error', reason: 'unexpected', message: e.message });
    }
    return;
  }

  if (msg.type === 'refresh') {
    analyzeSelection();
  } else if (msg.type === 'select' && Array.isArray(msg.ids)) {
    selectInstancesOnCanvas(msg.ids);
  } else if (msg.type === 'get-token') {
    var existingToken = await figma.clientStorage.getAsync(FIGMA_TOKEN_STORAGE_KEY);
    var existingSavedAt = await figma.clientStorage.getAsync(FIGMA_TOKEN_SAVED_AT_KEY);
    figma.ui.postMessage({ type: 'token-status', token: existingToken || null, savedAt: existingSavedAt || null });
    if (existingToken) await sendTokenCheckResult(existingToken);
  } else if (msg.type === 'save-token' && typeof msg.token === 'string') {
    var trimmedToken = msg.token.trim();
    var savedAtNow = Date.now();
    await figma.clientStorage.setAsync(FIGMA_TOKEN_STORAGE_KEY, trimmedToken);
    await figma.clientStorage.setAsync(FIGMA_TOKEN_SAVED_AT_KEY, savedAtNow);
    figma.ui.postMessage({ type: 'token-saved', savedAt: savedAtNow });
    await sendTokenCheckResult(trimmedToken);
  } else if (msg.type === 'clear-token') {
    await figma.clientStorage.deleteAsync(FIGMA_TOKEN_STORAGE_KEY);
    await figma.clientStorage.deleteAsync(FIGMA_TOKEN_SAVED_AT_KEY);
    figma.ui.postMessage({ type: 'token-cleared' });
  }
};

analyzeSelection();
