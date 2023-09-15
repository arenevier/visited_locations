"use strict";

const styles = [
  // level 0
  { "color": "#800026" },
  // level 1
  { "color": "#ff7800" },
  // level 2
  { "color": "#3388ff" },
];

L.VL = {};
L.VL.UndoRedo = L.Control.extend({
  initialize: function(_name, options) {
    L.setOptions(this, options);
    this._container = L.DomUtil.create('div', 'undo-redo-control leaflet-bar leaflet-control');
    const queue = options.undoQueue;
    this._undoHandler = () => {
      if (!this._undo.enabled) {
        return;
      }
      queue.undo();
    };
    this._redoHandler = () => {
      if (!this._redo.enabled) {
        return;
      }
      queue.redo();
    };

    this._undo = this._createButton();
    this._undo.getNode().classList.add('undo');
    this._undo.onClick((e) => {
      this._undoHandler();
    });

    this._redo = this._createButton();
    this._redo.getNode().classList.add('redo');
    this._redo.onClick((e) => {
      this._redoHandler();
    });

    // by default, both undo and redo are disabled
    this._undo.disable();
    this._redo.disable();

    queue.on('undoEnabled', (enabled) => {
      if (enabled) {
        this._undo.enable();
      } else {
        this._undo.disable();
      }
    });

    queue.on('redoEnabled', (enabled) => {
      if (enabled) {
        this._redo.enable();
      } else {
        this._redo.disable();
      }
    });
  },

  _onKeyUp: function(e) {
    const evt = e.originalEvent;
    if (evt.ctrlKey) {
      if (evt.key === 'z') {
        this._undoHandler();
      } else if (evt.key === 'y') {
        this._redoHandler();
      }
    }
  },

  onRemove: function(map) {
    map.off('keyup', this._onKeyUp, this);
  },

  onAdd: function(map) {
    map.on('keyup', this._onKeyUp, this);
    return this._container;
  },

  _createButton() {
    const btn = new ButtonLike(L.DomUtil.create('span', 'undo-redo-image'), 'undo-redo-button');
    this._container.appendChild(btn.getNode());
    return btn;
  },

});

L.VL.AreaLayer = L.GeoJSON.extend({
  initialize: function(feature, options, id, parent, level) {
    this.id = id;
    this.parent = parent;
    this.level = level;
    this.children = [];
    L.GeoJSON.prototype.initialize.call(this, feature, options);
  }
});

L.VL.ButtonControl = L.Control.extend({
  initialize: function(_name, options) {
    L.setOptions(this, options);
    this._container = L.DomUtil.create('div', 'leaflet-bar leaflet-control control-with-text');
    const btn = createControlButtonText(options.text);
    this._container.appendChild(btn.getNode());
    btn.onClick(async (e) => {
      btn.disable();
      if (this._activeCallback) {
        await this._activeCallback(e);
      }
      btn.enable();
    });
    this._activeCallback = null;
  },
  onActivate(callback) {
    this._activeCallback = callback;
  },
  onAdd: function(_map) {
    return this._container;
  }
});

L.VL.SaveControl = L.VL.ButtonControl.extend({
  initialize: function(_name, options) {
    L.VL.ButtonControl.prototype.initialize.call(this, _name, Object.assign({text: gI18n.Save}, options));
  },
});

L.VL.EditControl = L.VL.ButtonControl.extend({
  initialize: function(_name, options) {
    L.VL.ButtonControl.prototype.initialize.call(this, _name, Object.assign({text: gI18n.Duplicate}, options));
  },
});

L.VL.ShareControl = L.VL.ButtonControl.extend({
  initialize: function(_name, options) {
    L.VL.ButtonControl.prototype.initialize.call(this, _name, Object.assign({ text: gI18n.Share}, options));
  },
});


L.Control.Attribution.prototype.options.prefix = `<a href="https://github.com/arenevier/visited_locations" title="${gI18n.SourceCodeLink}">Visited Locations</a>`

function createControlButtonText(text) {
  const content = document.createTextNode(text);
  return new ButtonLike(content);
}

class ButtonLike {
  #node;
  #clickCallback;
  #enabled = true;

  constructor(content, attrs) {
    this.#node = L.DomUtil.create('a', attrs || 'control-button');
    this.#node.href = '#';
    this.#node.setAttribute('role', 'button');
    this.#node.appendChild(content);
    this.#node.onclick = (e) => {
      L.DomEvent.stop(e);
      if (!this.#enabled) {
        return;
      }
      if (this.#clickCallback) {
        this.#clickCallback(e);
      }
    };
  }

  getNode() {
    return this.#node;
  }

  onClick(callback) {
    this.#clickCallback = callback;
  }

  get enabled() {
    return this.#enabled;
  }

  disable() {
    if (!this.#enabled) {
      return;
    }
    this.#enabled = false;
    this.#node.setAttribute('aria-disabled', 'true');
    this.#node.classList.add('leaflet-disabled');
  }

  enable() {
    if (this.#enabled) {
      return;
    }
    this.#enabled = true;
    this.#node.setAttribute('aria-disabled', 'false');
    this.#node.classList.remove('leaflet-disabled');
  }
}

class ContextMenu {
  #container;
  #btn;

  constructor(text) {
    this.#container = L.DomUtil.create('div', 'leaflet-control leaflet-bar control-with-text');
    this.#container.id = 'context-menu';

    this.#btn = createControlButtonText(text);
    this.#container.appendChild(this.#btn.getNode());
  }

  addTo(map) {
    map.on('ousedown', e => {
      // if we click inside the container
      const domTarget = e.originalEvent.target;
      const isInside = domTarget === this.#container || this.#container.compareDocumentPosition(domTarget) & Node.DOCUMENT_POSITION_CONTAINED_BY;
      if (isInside) {
        return;
      }
      this.hide();
    });
    map.on('keyup', _e => {
      this.hide();
    });
    map.getContainer().appendChild(this.#container);
  }

  show(position) {
    this.#btn.enable();
    this.#container.style.display = 'block';
    L.DomUtil.setPosition(this.#container, position);
  }

  hide() {
    this.#btn.disable();
    this.#container.style.display = 'none';
  }

  setAction(action) {
    this.#btn.onClick(() => {
      action();
      this.hide();
    });
  }
}

function createBaseMap() {
  const canvas = document.createElement('div');
  // occupy full document size
  canvas.style.position = 'absolute';
  canvas.style.top = '0';
  canvas.style.bottom = '0';
  canvas.style.left = '0';
  canvas.style.right = '0';
  document.body.appendChild(canvas);

  const bounds = L.latLngBounds([-90, -180], [90, 180]);

  const maxZoom = 19;
  const minZoom = 3;
  const initialZoom = 3;
  const initialMapCenter = [43.0, -38.0];

  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: maxZoom,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  return L.map(canvas, {
    maxBounds: bounds,
    maxZoom: maxZoom,
    minZoom: minZoom,
    layers: [tiles],
    doubleClickZoom: false,
    center: initialMapCenter,
    zoom: initialZoom,
  });
}

async function saveFeatures(features) {
  const url = new URL('api/save', location.origin);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(features.allLayerIds()),
  });
  if (res.status !== 200) {
    throw new Error(res.status);
  }
  const {id} = await res.json();
  return id;
}

async function featureWithId(id) {
  const url = new URL('api/feature', location.origin);
  url.searchParams.append('id', id);
  const resp = await fetch(url);
  if (!resp.ok) {
    return null;
  }
  const json = await resp.json();
  return json;
}

async function featureIdAtPosition(latlng, parent) {
  const url = new URL('api/hittest', location.origin);
  url.searchParams.append('lat', latlng.lat);
  url.searchParams.append('lng', latlng.lng);
  if (parent != null) {
    url.searchParams.append('parent', parent.id);
  }
  const resp = await fetch(url);
  if (!resp.ok) {
    return null;
  }
  const id = await resp.text();
  return id;
}

async function featureAtPosition(latlng, parent) {
  const featureId = await featureIdAtPosition(latlng, parent);
  return await featureWithId(featureId);
}

class FeatureSet {
  #map;
  #layersById = new Map();
  #undoQueue = new UndoQueue();
  #atLeastOneFeatureCB = null;
  #zeroFeatureCB = null;
  constructor(map) {
    this.#map = map;
  }

  hasLayer(id) {
    return this.#layersById.has(id);
  }

  allLayerIds() {
    return Array.from(this.#layersById.keys());
  }

  addFeature(feature, bypassUndo) {
    const { properties } = feature;
    const parent = this.#layersById.get(properties.parent);
    const layer =  new L.VL.AreaLayer(feature.geometry, { style: styles[properties.level] }, properties.id, parent, properties.level);

    const action = {
      do: () => {
        this._addSingleLayer(layer);
      },
      undo: () => {
        this._removeSingleLayer(layer);
      }
    };
    if (!bypassUndo) {
      this.#undoQueue.addAction(action);
    }
    action.do();
    return layer;
  }

  removeLayer(layer) {
    const layersAndChildren = [];
    const collectLayers = (layer) => {
      layersAndChildren.push(layer);
      layer.children.forEach(collectLayers);
    };
    collectLayers(layer);

    const action = {
      do: () => {
        layersAndChildren.forEach((layer) => {
          this._removeSingleLayer(layer);
        });
      },

      undo: () => {
        layersAndChildren.forEach((layer) => {
          this._addSingleLayer(layer);
        });
      }
    };
    this.#undoQueue.addAction(action);
    action.do();
  }

  onAtLeastOneFeature(callback) {
    this.#atLeastOneFeatureCB = callback;
  }

  onZeroFeature(callback) {
    this.#zeroFeatureCB = callback;
  }

  _addSingleLayer(layer) {
    const layerCount = this.#layersById.size;
    this.#map.addLayer(layer);
    this.#layersById.set(layer.id, layer);
    if (layer.parent) {
      layer.parent.children.push(layer);
    }
    if (layerCount === 0 && this.#atLeastOneFeatureCB) {
      this.#atLeastOneFeatureCB();
    }
  }

  _removeSingleLayer(layer) {
    this.#map.removeLayer(layer);
    this.#layersById.delete(layer.id);
    if (layer.parent) {
      const childIndex = layer.parent.children.indexOf(layer);
      if (childIndex === -1) {
        throw new Error('layer not found in parent');
      }
      layer.parent.children.splice(childIndex, 1);
    }
    const layerCount = this.#layersById.size;
    if (layerCount === 0 && this.#zeroFeatureCB) {
      this.#zeroFeatureCB();
    }
  }

  getUndoQueue() {
    return this.#undoQueue;
  }

  setStyleAll(style) {
    for (const layer of this.#layersById.values()) {
      layer.setStyle(style);
    }
  }
}

class UndoQueue {
  #actions = [];
  #currentIndex = -1;
  #undoEnabledHandler = null;
  #redoEnabledHandler = null;

  addAction(action) {
    this.#actions.length = this.#currentIndex + 1;
    this.#actions.push(action);
    this.#currentIndex++;
    if (this.#undoEnabledHandler != null) {
      this.#undoEnabledHandler(true);
    }
    if (this.#redoEnabledHandler != null) {
      this.#redoEnabledHandler(false);
    }
  }

  undo() {
    if (this.#currentIndex < 0) {
      return;
    }
    this.#actions[this.#currentIndex].undo();
    this.#currentIndex--;
    if (this.#undoEnabledHandler != null) {
      if (this.#currentIndex >= 0) {
        this.#undoEnabledHandler(true);
      } else {
        this.#undoEnabledHandler(false);
      }
    }
    if (this.#redoEnabledHandler != null) {
      this.#redoEnabledHandler(true);
    }
  }

  redo() {
    if (this.#currentIndex >= this.#actions.length - 1) {
      return;
    }
    this.#currentIndex++;
    this.#actions[this.#currentIndex].do();
    if (this.#undoEnabledHandler != null) {
      this.#undoEnabledHandler(true);
    }
    if (this.#redoEnabledHandler != null) {
      if (this.#currentIndex < this.#actions.length - 1) {
        this.#redoEnabledHandler(true);
      } else {
        this.#redoEnabledHandler(false);
      }
    }
  }

  on(type, handler) {
    if (type === 'undoEnabled') {
      this.#undoEnabledHandler = handler;
    } else if (type === 'redoEnabled') {
      this.#redoEnabledHandler = handler;
    } else {
      throw new Error('unknown type ' + type);
    }
  }
}

function createBottomCenterCorner(map) {
  // hack a corner to the bottom center of the map
  // copy of createCorner method of leaflet
  const vSide = 'bottom';
  const hSide = 'center';
  var l = 'leaflet-';
  var className = l + vSide + ' ' + l + hSide;
  map._controlCorners[vSide + hSide] = L.DomUtil.create('div', className, map._controlContainer);
}

function createSaveErrorBox() {
  const container = L.DomUtil.create('div', 'leaflet-control', document.getElementById('info-bar'));
  const box = L.DomUtil.create('div', 'info-error info-item leaflet-bar', container);
  box.innerHTML = gI18n.SaveError;
  return new SimpleBox(box, {closeBtnSrc: "simplebox/icons/close.png"});
}

function createExplainBox() {
  const container = L.DomUtil.create('div', 'leaflet-control', document.getElementById('info-bar'));
  const box = L.DomUtil.create('div', 'info-item leaflet-bar', container);
  const content = L.DomUtil.create('p', '', box);
  content.textContent = gI18n.Explain;
  const doNotAskAgain = L.DomUtil.create('p', 'do-not-ask-again', box);
  doNotAskAgain.textContent = gI18n.DoNotAskAgain;
  const chebox = L.DomUtil.create('input', '', doNotAskAgain);
  chebox.type = 'checkbox';
  return new SimpleBox(box, {closeBtnSrc: "simplebox/icons/close.png"});
}

function navigateToUrl(url, relative) {
  const currentUrl = new URL(location.href);
  const newUrl = new URL(url, relative ? `${location.protocol}//${location.host}` : null);
  for (const param of ['lng']) {
    if (currentUrl.searchParams.has(param)) {
      newUrl.searchParams.set(param, currentUrl.searchParams.get(param));
    }
  }
  window.location.replace(newUrl);
}

function main() {
  const map = createBaseMap();
  createBottomCenterCorner(map);
  const features = new FeatureSet(map);

  if (localStorage.getItem("do-not-ask-explainer") == null) {
    const explainBox = createExplainBox();
    explainBox.show();
    document.addEventListener('simplebox:show', (e) => {
      if (e.detail === explainBox) {
        const checkbox = explainBox.element.querySelector('input[type="checkbox"]');
        if (checkbox.checked) {
          localStorage.setItem("do-not-ask-explainer", "1");
        }
      }
    });
  }

  const saveErrorMsg = createSaveErrorBox();

  let mode = ''; // display|edit|delete|save
  function setMode(aMode) {
    if (mode === aMode) {
      return;
    }
    mode = aMode;

    switch (mode) {
      case 'display':

        features.setStyleAll({
          weight: 1,
          fillOpacity: 0.3,
          dashArray: "",
        });

        undoRedo.remove();

        saveButton.remove();
        features.onAtLeastOneFeature(() => {
        });
        features.onZeroFeature(() => {
        });
        editButton.addTo(map);
        if (shareButton) {
          shareButton.addTo(map);
        }
        break;
      case 'edit':
      case 'save':
        features.setStyleAll({
          weight: 3,
          fillOpacity: 0.2,
          dashArray: "",
        });

        map.addControl(undoRedo);

        if (features.allLayerIds().length !== 0) {
          saveButton.addTo(map);
        }
        features.onAtLeastOneFeature(() => {
          saveButton.addTo(map);
        });
        features.onZeroFeature(() => {
          saveButton.remove();
        });
        editButton.remove();
        if (shareButton) {
          shareButton.remove();
        }
        break;
      case 'delete':
        features.setStyleAll({
          weight: 0.5,
          fillOpacity: 0.2,
          dashArray: "3 5",
        });

        undoRedo.remove();

        saveButton.remove();
        features.onAtLeastOneFeature(() => {
        });
        features.onZeroFeature(() => {
        });
        editButton.remove();
        if (shareButton) {
          shareButton.remove();
        }
        break;
    }
  }

  map.on('keyup', (e) => {
    if (e.originalEvent.key === 'Delete') {
      setMode('delete');
    }
    if (mode === 'delete' && e.originalEvent.key === 'Escape') {
      setMode('edit');
    }
  });
  const contextMenu = new ContextMenu(gI18n.Delete);
  contextMenu.hide();
  contextMenu.addTo(map);

  const saveButton = new L.VL.SaveControl('save-controls', { position: 'bottomleft', map: map });
  saveButton.onActivate(async (_e) => {
    try {
      setMode('save');
      const saveId = await saveFeatures(features);
      navigateToUrl(saveId, true);
    } catch (e) {
      setMode('edit');
      saveErrorMsg.show();
    }
  });

  let shareButton;
  if (navigator.share) {
    shareButton = new L.VL.ShareControl('share-controls', { position: 'bottomcenter', map: map });
    shareButton.onActivate(async (_e) => {
      navigator.share({
        text: 'share your map',
        url: window.location.href,
      });
    });
  }

  const editButton = new L.VL.EditControl('edit-controls', {position: 'bottomleft', map: map});
  editButton.onActivate(async (_e) => {
    setMode('edit');
  });


  const undoRedo = new L.VL.UndoRedo('undo-controls', {position: 'topright', map: map, undoQueue: features.getUndoQueue()});

  function addFeatureOnMap(feature, bypassUndo) {
    const layer = features.addFeature(feature, bypassUndo);

    layer.on("contextmenu", (e) => {
      if (mode !== 'edit') {
        return;
      }
      contextMenu.show(e.containerPoint.add(new L.Point(-10, -10)));
      contextMenu.setAction(() => {
        features.removeLayer(layer);
      });
    });

    layer.on('click', async e => {
      const layer = e.target;

      switch (mode) {
        case 'display':
          editButton.addTo(map);
          return;
        case 'delete':
          L.DomEvent.stop(e);
          setMode('edit');
          features.removeLayer(layer);
          return;
        case 'edit':
          editButton.remove();
          await fetchFeatureAtPosition(e.latlng, layer);
          return;
      }
    });
  }

  async function fetchFeatureAtPosition(latlng, parent) {
    const feature = await featureAtPosition(latlng, parent);
    if (feature == null) {
      return null;
    }

    if (parent != null && !features.hasLayer(parent.id)) {
      // protect against possible timing issue in which parent layer would have been removed by now
      return;
    }

    if (features.hasLayer(feature.properties.id)) {
      // prevent fast double click from showing the layer twice
      return;
    }
    addFeatureOnMap(feature, false);
  }

  map.on('click', async e => {
    switch (mode) {
      case 'display':
      return;
    case 'delete':
      L.DomEvent.stop(e);
      setMode('edit');
      return;
    case 'edit':
      await fetchFeatureAtPosition(e.latlng, null);
        return;
    }
  })


  if (gInitialFeatures.length > 0) {
    gInitialFeatures.forEach(feature => {addFeatureOnMap(feature, true)});
    setMode('display');
  } else {
    setMode('edit');
  }

  window.addEventListener('beforeunload', event => {
    if ((mode === 'edit' || mode === 'delete') && features.allLayerIds().length !== 0) {
      event.returnValue = "";
    }
  });
}
