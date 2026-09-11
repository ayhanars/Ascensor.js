// Screen Component Inspector — main plugin thread.
// Reads the selected screen/frame, identifies component instances within it,
// classifies them via [ds-component] / [ds-atom] tags in their component
// descriptions, and sends a structured summary to the UI. Never mutates
// the document.

figma.showUI(__html__, { width: 420, height: 640 });

var VALID_SCREEN_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'];

var DS_COMPONENT_TAG = '[ds-component]';
var DS_ATOM_TAG = '[ds-atom]';

function classifyDescription(description) {
  var text = (description || '').toLowerCase();
  var tags = [];
  if (text.indexOf(DS_COMPONENT_TAG) !== -1) tags.push(DS_COMPONENT_TAG);
  if (text.indexOf(DS_ATOM_TAG) !== -1) tags.push(DS_ATOM_TAG);

  var classification = 'Unclassified';
  if (tags.indexOf(DS_COMPONENT_TAG) !== -1) classification = 'DS Component';
  else if (tags.indexOf(DS_ATOM_TAG) !== -1) classification = 'DS Atom';

  return { classification: classification, tags: tags };
}

function buildFigmaLink(node) {
  var fileKey = figma.fileKey;
  if (!fileKey) return null;
  return 'https://www.figma.com/file/' + fileKey + '/?node-id=' + encodeURIComponent(node.id);
}

// Resolves an instance's underlying component identity, description and
// documentation links. Falls back to the parent component set's data when
// the instance's specific variant has none of its own — variant components
// often carry shared metadata on the set rather than on each variant.
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

  var name = isInSet ? (parent.name + ' / ' + mainComponent.name) : mainComponent.name;

  return {
    id: mainComponent.id,
    name: name,
    description: description,
    documentationLinks: documentationLinks
  };
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

  var instances = screenNode.findAll(function (n) { return n.type === 'INSTANCE'; });

  var order = [];
  var byId = {};

  for (var i = 0; i < instances.length; i++) {
    var info = await resolveComponentInfo(instances[i]);
    if (!info) continue;

    if (!byId[info.id]) {
      var classified = classifyDescription(info.description);
      byId[info.id] = {
        id: info.id,
        name: info.name,
        count: 0,
        classification: classified.classification,
        tags: classified.tags,
        description: info.description,
        links: info.documentationLinks.map(function (l) { return l.uri; })
      };
      order.push(info.id);
    }
    byId[info.id].count += 1;
  }

  var components = order.map(function (id) { return byId[id]; });

  figma.ui.postMessage({
    type: 'result',
    screen: {
      name: screenNode.name,
      link: buildFigmaLink(screenNode)
    },
    components: components
  });
}

figma.on('selectionchange', function () {
  analyzeSelection();
});

figma.ui.onmessage = function (msg) {
  if (msg && msg.type === 'refresh') {
    analyzeSelection();
  }
};

analyzeSelection();
