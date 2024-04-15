var keyFrameManager;
var pointManager;
var viewer;

var minDistance = 0;
var maxDistance = Infinity;
var maxHotspots = Infinity;

/*parameters to adjust the look of the hotspots based on distance:
* color1 is used the closer hotspots are and fades into color2 the further
* they are away; size1 and size2 work similar as they define
* the size of the hotspots;
* colorGrey1 and colorGrey2 are for hotspots, that dont have an image yet
* minDistCss and maxDistCss define the distance over which the fade effect
* is set
*/
var color1 = [0, 0, 255];
var color2 = [255, 0, 0];
var colorGrey1 = [0, 0, 0];
var colorGrey2 = [200, 200, 200];
var size1 = 20;
var size2 = 5;
var sigma = 0.005;
var customSize = 20;
var minDistCss = 0;
var maxDistCss = 6;

var numberOfFrames = undefined;

var closestHotspots = new Map();
var defaultHFov;
var sceneChanging = false;

var viewerUpdateTimeout;
var updateViewerEnabled = true;
var updateTimeout = 1000;

var updatedIds = [];
var lastScene = undefined;
var thisScenePosition;
var matrix; //describes the rotation from cam to world
var matrix2; //inverse of matrix
var currentSceneUndefined = true; // <=> thisScenePosition == undefined || matrix == undefined || matrix2 == undefined

var image_db = new Map;
var hotspotsNoImage = new Map();
var viewerInitialized;  // false, while the placeholder scene is the current scene
var recoFolder = undefined;
var imageFolder = undefined;
var firstImageName = undefined;
var thisScene_Id = undefined;
var thisScene_srcfrmid = undefined;
var currentScene_srcfrmid = undefined;
var socketTimeout = undefined;
var videoPresent = false;

var srcfrmid_diff = 50;
var next_keyframe = undefined;
var autoupdate = false;
var nextScene = undefined;
var nextSceneStats = undefined;

var socket = io();

socket.on("fps", (value) => {
  numberOfFrames = value;
});


//see if any useful
socket.on("map_publish", (msg) => {
  window.clearTimeout(socketTimeout);
  socketTimeout = window.setTimeout(() => {
    updateViewerEnabled = true;
    updateViewer(null, []);
  }, 2000);
  onMapPublished(msg);
});

socket.on('smallVideoProgress', (progress) => {
  document.getElementById("smallVideoProgress").value = progress.percent;
});

socket.on('smallVideo', (file) => {
  document.getElementById("progressForSmallVideo").style.visibility = "hidden";

  document.getElementById("vidCtrl").style.visibility = "visible";
  //document.getElementById("createdPano").style.visibility = "visible";
  //hide list
  var source = document.createElement('source');
  source.setAttribute('src', file.replace('./3dpano', ''));
  source.setAttribute('type', 'video/' + (file.split('.')[file.split('.').length - 1]));
  var video = document.getElementById('video');
  video.appendChild(source);
  videoPresent = true;
  if(thisScene_Id !== undefined) {
    video.currentTime = parseInt(keyFrameManager.getSrcFrmId(thisScene_Id)*numberOfFrames);
  }
});

socket.on('disconnect', () => {
  console.log("3DPanoserver disconnected");
});
socket.on('status', (status) => {
  console.log(status);
  if(status.includes("openvslam finished")) {
    let text = document.createElement('p');
    text.innerHTML = "OpenVSLAM finished, panomode can be accessed ";
    var a = document.createElement('a');
    a.innerHTML = "here";
    a.target="_blank";
    a.href = "http://localhost:3002/?reco=" + status.split('_')[1];
    text.appendChild(a);
    document.getElementById('recoLink').appendChild(text);
  }
});
socket.on('connect', function () {
  console.log("3DPanoserver connect");
});

function init() {
  keyFrameManager = new KeyFrameManager();
  pointManager = new PointManager();
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reco') !== null) {
    initViewer();
    recoFolder = urlParams.get('reco');
    initRecoFiles("url");
    /*firstImageName = urlParams.get('img').replace('/3dpano', '');
    imageFolder = firstImageName.replace(firstImageName.split('/')[firstImageName.split('/').length - 1], '');
    var timestamp = firstImageName.replace(imageFolder, '').replace('.jpg', '');
    viewer.on('load', function () {
      viewer.off('load');
      viewer.addScene("firstScene", {
        "panorama": firstImageName,
        "type": "equirectangular"
      });
      viewer.loadScene("firstScene");
      viewerInitialized = true;
      viewer.on('load', function () {
        viewer.off('load');
        initRecoFiles("url");
        var file = imageFolder + "thisVideo_small.mp4";
        document.getElementById("vidCtrl").style.visibility = "visible";
        var source = document.createElement('source');
        source.setAttribute('src', file);
        source.setAttribute('type', 'video/' + (file.split('.')[file.split('.').length - 1]));
        var video = document.getElementById('video');
        video.appendChild(source);
        videoPresent = true;
        video.currentTime = parseInt(timestamp);
      });
    });*/
  } else {
    initProtobuf();
    initViewer();
  }
}

init();

function initProtobuf() {
  protobuf.load("map_segment.proto", function (err, root) {
    mapSegment = root.lookupType("map_segment.map");
    mapMsg = root.lookupType("map_segment.map.msg");
  });
}

function initViewer() {
  viewer = pannellum.viewer('panorama', {
    "default": {
      "firstScene": "placeholder",
      "showControls": false,
      "sceneFadeDuration": 1000,
      "minHfov": 2,
      "maxHfov": 140
    },
    "scenes": {
      "placeholder": {
        "panorama": "/placeholder.jpg",
        "type": "equirectangular",
        "autoLoad": true
      }
    }
  });
  viewerInitialized = false;
}

function initRecoFiles(target) {
  if (target === "live") {
    socket.emit("RecoRequest", "lock");
    socket.on("RecoRequest", function (data) {
      if (data === "granted") {
        console.log("reco files loading");
        if (imageFolder !== undefined) {
          jQuery.getJSON(imageFolder + "images.json", setImages)
            .fail(function (jqxhr, textStatus, error) {
              if (jqxhr.status == 404) {
                console.log("image log not found");
              } else {
                console.log(jqxhr);
                console.log(textStatus);
                console.log(error);
              }
            });
        }
      }
    });
  }
  if (target === "url") {
    jQuery.getJSON(recoFolder + "/images.json", setImagesFromReco)
      .fail(function (jqxhr, textStatus, error) {
        if (jqxhr.status == 404) {
          console.log("images log not found");
        } else {
          console.log(jqxhr);
          console.log(textStatus);
          console.log(error);
        }
    });
  }
}

function setImages(data) {
  /*for (var i = 0; i < data.images.length; i++) {
    images.push(data.images[i].replace('./3dpano', ''));
  }
  console.log(data.images.length + " images loaded");
  jQuery.getJSON(imageFolder + "keyframes.json", setKeyframes).fail(function (jqxhr, textStatus, error) {
    if (jqxhr.status == 404) {
      console.log("keyframe log not found");
    }
  });*/
  /*numberOfFrames = data.fps;
  let outputpath = data.imagePath;
  imageFolder = data.imagePath;
  socket.emit("access", outputpath);
  socket.on("access", function(msg) {
    if(msg === "granted") {
      for (var i = 0; i < data.images.length; i++) {
      let id = data.images[i].replace("rgb_","").replace(".png","");
      let imgPath = outputpath + "/" + data.images[i];
      image_db.set(parseInt(id), imgPath);
      if (!viewerInitialized) {
        firstImageName = imgPath;
        viewer.addScene("firstScene", {
          "panorama": imgPath,
          "type": "equirectangular"
        });
        viewer.loadScene("firstScene");
        viewerInitialized = true;
      }
      }
    }
      jQuery.getJSON(recoFolder + "/keyframes.json", setKeyframesFromReco).fail(function (jqxhr, textStatus, error) {
      if (jqxhr.status == 404) {
        console.log("keyframe log not found");
      }
    });
  });*/
};

function setKeyframes(data) {
  /*var keyframes = [];
  for (var i = 0; i < data.keyframes.length; i++) {
    var id = Object.keys(data.keyframes[i])[0];
    var pose = data.keyframes[i][id].pose;
    let keyframe = {};
    keyframe["id"] = parseInt(id);
    keyframe["timestamp"] = data.keyframes[i][id].timestamp;
    keyframe["camera_pose"] = [];
    //console.log("pose from reco: " + pose);
    array2mat44(keyframe["camera_pose"], pose);
    keyframes.push(keyframe);
  }
  updateViewer("fromReco", keyframes);
  socket.emit("RecoRequest", "release");*/
};

function setImagesFromReco(data) {
  numberOfFrames = data.fps;
  let outputpath = recoFolder;
  imageFolder = recoFolder;
  socket.emit("access", outputpath);
  socket.on("access", function(msg) {
    if(msg === "granted") {
      for (var i = 0; i < data.images.length; i++) {
      let id = data.images[i].replace("rgb_","").replace(".png","");
      let imgPath = outputpath + "/" + data.images[i];
      image_db.set(parseInt(id), imgPath);
      if (!viewerInitialized) {
        firstImageName = imgPath;
        viewer.addScene("firstScene", {
          "panorama": imgPath,
          "type": "equirectangular"
        });
        viewer.loadScene("firstScene");
        viewerInitialized = true;
      }
      }
    }
      jQuery.getJSON(recoFolder + "/keyframes.json", setKeyframesFromReco).fail(function (jqxhr, textStatus, error) {
      if (jqxhr.status == 404) {
        console.log("keyframe log not found");
      }
    });
  });
};

function setKeyframesFromReco(data) {
  var keyframes = [];
  for (var i = 0; i < data.keyframes.length; i++) {
    var id = Object.keys(data.keyframes[i])[0];
    var pose = data.keyframes[i][id][0].pose;
    let keyframe = {};
    keyframe["id"] = parseInt(id);
    keyframe["srcfrmid"] = data.keyframes[i][id][0].srcfrmid;
    keyframe["camera_pose"] = [];
    array2mat44(keyframe["camera_pose"], pose);
    if ((keyframe["srcfrmid"]) === parseInt(firstImageName.replace(imageFolder + "/rgb_", '').replace('.png', ''))) {
      thisScene_Id = parseInt(id);
    }
    keyframes.push(keyframe);
  }
  let image = [];
  updateViewerEnabled = true;
  updateViewer("fromReco", keyframes, image);
};

function onMapPublished(msg) {
  if (msg.length == 0 || mapSegment == undefined) {
    return;
  }

  var keyframes = [];
  var images = [];
  var buffer = base64ToUint8Array(msg);
  var obj = mapSegment.decode(buffer);
  loadProtobufData(obj, keyframes, images);
  updateViewer(msg.length, keyframes, images);
}

function array2mat44(mat, array) {
  for (let i = 0; i < 4; i++) {
    let raw = [];
    for (let j = 0; j < 4; j++) {
      let k = i * 4 + j;
      let elm = array[k];
      raw.push(elm);
    }
    mat.push(raw);
  }
}
function loadProtobufData(obj, keyframes, images) {
  for (let keyframeObj of obj.keyframes) {
    let keyframe = {};
    keyframe["id"] = keyframeObj.id;
    keyframe["srcfrmid"] = keyframeObj.srcfrmid;
    if (keyframeObj.pose != undefined) {
      keyframe["camera_pose"] = [];
      array2mat44(keyframe["camera_pose"], keyframeObj.pose.pose);
    }
    keyframes.push(keyframe);
  }
  for (let image of obj.images) {
    images.push(normalizePath(image.path));
  }
}

function base64ToUint8Array(base64) {
  let binaryString = window.atob(base64);
  let len = binaryString.length;
  let bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function updateViewer(msgSize, keyframes, images) {
  for (let keyframe of keyframes) {
    let id = keyframe["id"];
    if (keyframe["camera_pose"] == undefined || keyframe["srcfrmid"] == undefined) {
      updatedIds.push(id);
      keyFrameManager.removeKeyframe(id);
    }
    else {
      updatedIds.push(id);
      keyFrameManager.updateKeyframe(id, keyframe["camera_pose"], keyframe["srcfrmid"]);
    }
  }
  if(images){
    for (let image of images) {
     let id = image.split('/')[image.split('/').length-1].replace("rgb_","").replace(".png","");
     image_db.set(parseInt(id), image); //srcfrm id
     if(firstImageName === undefined) {
       firstImageName = image;
       thisScene_Id = keyFrameManager.getIdBySrcFrmId(parseInt(id));
       thisScene_srcfrmid = parseInt(id);
       if (!viewerInitialized) {
         viewer.addScene("firstScene", {
           "panorama": firstImageName,
           "type": "equirectangular"
         });
         viewer.loadScene("firstScene");
         viewerInitialized = true;
       }
    }
    }
   }
  if (!sceneChanging || !viewerInitialized) {
    if (updateViewerEnabled) {
      var keyframes = new Map();
      keyFrameManager.getUpdatedKeyframes(updatedIds, keyframes);
      updateHotspots(keyframes);

      updateViewerEnabled = false;
      updatedIds = [];
      viewerUpdateTimeout = window.setTimeout(function () {
        updateViewerEnabled = true;
      }, updateTimeout);
    }
  }
}


function updateHotspots(keyframes) {
  if(firstImageName !== undefined) {
  if (currentSceneUndefined) {
    let thisScenePose = keyFrameManager.localize(thisScene_Id);
    if (thisScenePose === undefined) {
    } else {
      thisScenePosition = [thisScenePose[12], thisScenePose[13], thisScenePose[14]];
      matrix2 = new THREE.Matrix4().set(thisScenePose[0], thisScenePose[1], thisScenePose[2], 0,
        thisScenePose[4], thisScenePose[5], thisScenePose[6], 0,
        thisScenePose[8], thisScenePose[9], thisScenePose[10], 0,
        0, 0, 0, 1);
      currentSceneUndefined = false;
    }
  }
  if (!currentSceneUndefined) {
    keyframes.forEach(function (pose, index) {
      hotspotsNoImage.delete(index);
      viewer.removeHotSpot("hotspot" + index);
      viewer.removeScene("scene" + index);
      closestHotspots.delete(index);
    });
    var updatedHotspots = new Map();
    keyframes.forEach(function (pose, index) {
      if (index !== thisScene_Id) {
        if (pose !== undefined) {
          var dx = pose[12] - thisScenePosition[0];
          var dy = pose[13] - thisScenePosition[1];
          var dz = pose[14] - thisScenePosition[2];
          var camDiff = new THREE.Vector3(dx, dy, dz);

          camDiff.applyMatrix4(matrix2);
          var x = camDiff.getComponent(0);
          var y = camDiff.getComponent(1);
          var z = camDiff.getComponent(2);

          var distance = Math.sqrt((x * x) + (y * y) + (z * z));

          if (distance > minDistance) {
            var pitch = 90 - Math.acos(-y / distance) * (180 / Math.PI);
            var yaw = Math.atan2(x, z) * (180 / Math.PI);
            var stats = [distance, yaw, pitch];
            updatedHotspots.set(index, stats);
          }
        }
      }
    }, keyframes);
    updatedHotspots.forEach(function (stats, index) {
      var srcfrmid = keyFrameManager.getKeyframeSrcFrmId(index);
      if(autoupdate) {
        if(nextScene === undefined) {
          if(srcfrmid > (thisScene_srcfrmid + srcfrmid_diff)) {
            if (image_db.has(srcfrmid)) {
              nextScene = index;
              nextSceneStats = [stats[2], stats[1], index, stats[0]];
            }
          }
        }
      }
      if(srcfrmid > 0) {
        if (image_db.has(srcfrmid)) {
          var link = image_db.get(srcfrmid);
          if(link !== undefined) {
            viewer.addScene("scene" + index, {
              "panorama": link,
              "type": "equirectangular"
            });
            var css = updateCss(index, stats[0]);
            viewer.addHotSpot({
             "pitch": stats[2],
             "yaw": stats[1],
             "type": "info",
             "createTooltipFunc": setIcon,
             "createTooltipArgs": stats[0],
             "cssClass": css,
             "clickHandlerFunc": manualTransition,
             "id": "hotspot" + index,
             "clickHandlerArgs": [stats[2], stats[1], index, stats[0]], // pitch, yaw, index, distance
             "scale": true
            }, viewer.getScene());
            closestHotspots.set(index, stats);
          }
        }/* else {
          var css = createGreyCss(index, stats[0]);
          viewer.addHotSpot({
           "pitch": stats[2],
           "yaw": stats[1],
           "type": "info",
           "cssClass": css,
           "id": "hotspot" + index,
           "scale": true
          }, viewer.getScene());
          closestHotspots.set(index, stats);
          hotspotsNoImage.set(index, srcfrmid);
        }*/
      }
    }, updatedHotspots);
    if(autoupdate) {
      if(nextScene !== undefined && nextSceneStats !== undefined) {
        if(!sceneChanging) {
          transition(null, nextSceneStats);
        }
      }
    }
  }
}
}

function updateCss(shot_id, distance) {
  var styleClassName = "hotspotCSS" + shot_id;
  if(document.getElementById(styleClassName) === null) {
    var distanceRange = maxDistCss - minDistCss;
    var percentageDistance = (distance - minDistCss) / distanceRange;
    if (percentageDistance < 0) {
      percentageDistance = 0;
    } else if (percentageDistance > 1) {
      percentageDistance = 1;
    }
    var size = size1 - ((size1 - size2) * percentageDistance);
    var color = calculateColor(percentageDistance);
    var style = document.createElement('style');
    style.id = styleClassName;
    style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px;' +
      ' background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',0.6); border-radius:' +
      ' 50%;border-color: #000000; border-style: solid; border-width: thin;}';
    document.getElementsByTagName('head')[0].appendChild(style);
  } else {
    document.getElementById(styleClassName).innerHTML;
    var distanceRange = maxDistCss - minDistCss;
    var percentageDistance = (distance - minDistCss) / distanceRange;
    if (percentageDistance < 0) {
      percentageDistance = 0;
    } else if (percentageDistance > 1) {
      percentageDistance = 1;
    }
    var size = size1 - ((size1 - size2) * percentageDistance);
    var color = calculateColor(percentageDistance);
    var estimatedInnerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px;' +
    ' background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',0.6); border-radius:' +
    ' 50%;border-color: #000000; border-style: solid; border-width: thin;}';
    var sizeCss = parseFloat(document.getElementById(styleClassName).innerHTML.replace('.' + styleClassName + '{ height: ','').split(" ")[0]);
    if(Math.abs(size - sizeCss) > sigma) {
      document.getElementById(styleClassName).innerHTML = estimatedInnerHTML;
    }
  }
  return styleClassName;
}

/*function createGreyCss(shot_id, distance) {
  var styleClassName = "hotspotCSS" + shot_id;
  if(document.getElementById(styleClassName) === null) {
    var distanceRange = maxDistCss - minDistCss;
    var percentageDistance = (distance - minDistCss) / distanceRange;
    if (percentageDistance < 0) {
      percentageDistance = 0;
    } else if (percentageDistance > 1) {
      percentageDistance = 1;
    }
    var size = size1 - ((size1 - size2) * percentageDistance); // size1 = 15, size2 = 5
    var color = calculateGreyColor(percentageDistance);
    var style = document.createElement('style');
    style.id = styleClassName;
    style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px;' +
      ' background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',0.6); border-radius:' +
      ' 50%;border-color: #000000; border-style: solid; border-width: thin;}';
    document.getElementsByTagName('head')[0].appendChild(style);
  }
  return styleClassName;
}*/

function manualTransition(hotSpotDiv, args) {
  autoupdate = false;
  transition(hotSpotDiv, args);
}

function transition(hotSpotDiv, args) {
  if (args[2] !== undefined) {
    sceneChanging = true;
    defaultHFov = 100;
    var zoomHfov = (((40 - 70) / (maxDistCss - minDistCss)) * args[3] + (40 - ((((40 - 70) / (maxDistCss - minDistCss)) * maxDistCss))));
    viewer.lookAt(args[0], args[1], zoomHfov, 1000);
    viewer.on('animatefinished', function () {
      viewer.off('animatefinished');
      openNewPano(hotSpotDiv, args);
    });
  }
}

function openNewPano(hotSpotDiv, args) {
  var angle = calculateOrientation(thisScene_Id, args[2]);
  var pitch = Math.round(angle[0] * 100) / 100;
  var yaw = Math.round(angle[1] * 100) / 100;
  thisScene_Id = args[2];
  thisScene_srcfrmid = keyFrameManager.getSrcFrmId(thisScene_Id);
  closestHotspots.forEach(function (stats, index) {
    viewer.removeHotSpot("hotspot" + index, viewer.getScene());
  }, closestHotspots);
  lastScene = viewer.getScene();
  let thisScenePose = keyFrameManager.localize(thisScene_Id);
  if (thisScenePose === undefined) {
    currentSceneUndefined = true;
  } else {
    thisScenePosition = [thisScenePose[12], thisScenePose[13], thisScenePose[14]];
      matrix2 = new THREE.Matrix4().set(thisScenePose[0], thisScenePose[1], thisScenePose[2], 0,
        thisScenePose[4], thisScenePose[5], thisScenePose[6], 0,
        thisScenePose[8], thisScenePose[9], thisScenePose[10], 0,
        0, 0, 0, 1);
    currentSceneUndefined = false;
  }
  viewer.on('scenechange', function () {
    viewer.off('scenechange');
    closestHotspots = new Map();
    var keyframes = new Map();
    nextScene = undefined;
    nextSceneStats = undefined;
    keyFrameManager.asMap(keyframes);
    updateHotspots(keyframes);
    if (videoPresent) {
      if (numberOfFrames !== undefined) {
        document.getElementById('video').currentTime = keyFrameManager.getSrcFrmId(thisScene_Id)/numberOfFrames;
      }
    }
    sceneChanging = false;
  });
  viewer.loadScene("scene" + args[2], pitch, yaw, defaultHFov);
}

function calculateOrientation(firstShot_id, nextShot_id) {
  var nextShot = keyFrameManager.localize(nextShot_id);
  var dx = nextShot[12] - thisScenePosition[0];
  var dy = nextShot[13] - thisScenePosition[1];
  var dz = nextShot[14] - thisScenePosition[2];
  var matrixX = new THREE.Matrix4().set(nextShot[0], nextShot[4], nextShot[8], 0,
    nextShot[1], nextShot[5], nextShot[9], 0,
    nextShot[2], nextShot[6], nextShot[10], 0,
    0, 0, 0, 1);
  var matrix2X = new THREE.Matrix4().getInverse(matrixX);
  var nextShotVector = new THREE.Vector3(dx, dy, dz);

  nextShotVector.applyMatrix4(matrix2X);
  var x = nextShotVector.getComponent(0);
  var y = nextShotVector.getComponent(1);
  var z = nextShotVector.getComponent(2);

  var distance = Math.sqrt((x * x) + (y * y) + (z * z));
  var pitch = 90 - Math.acos(-y / distance) * (180 / Math.PI);
  var yaw = Math.atan2(x, z) * (180 / Math.PI);
  var result = [pitch, yaw];
  return result;
}

function setIcon(hotSpotDiv, args) {
  /*hotSpotDiv.classList.add('foot-icon');
  var i = document.createElement('i');
  i.innerHTML = "";

  i.classList.add("fas");
  i.classList.add("fa-shoe-prints");
  i.classList.add("fa-rotate-270");
  let size = (Math.round(getSize(args) * 0.5) + "px");
  i.style.fontSize = size; //<- for adjusting size
  hotSpotDiv.appendChild(i);*/
  //fix size
}

function getSize(distance) {
  var percentage = (distance - minDistCss)/(maxDistCss - minDistCss);
  if (percentage < 0) {
    percentage = 0;
  } else if (percentage > 1) {
    percentage = 1;
  }
  return (size1 - ((size1 - size2) * percentage));
}

function createBrightCss(shot_id, distance) {
  var styleClassName = "hotspotCSS" + shot_id.replace(imageEnding, "");
  var distanceRange = maxDistCss - minDistCss;
  var percentageDistance = (distance - minDistCss) / distanceRange;
  if (percentageDistance < 0) {
    percentageDistance = 0;
  } else if (percentageDistance > 1) {
    percentageDistance = 1;
  }
  var size = customSize;//-(15*percentageDistance);
  var color = [255, 255, 0];//calculateColor(percentageDistance);
  var style = document.createElement('style');
  style.id = styleClassName;
  style.type = 'text/css';
  style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px; background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',1); border-radius: 50%;border-color: #000000; border-style: solid; border-width: thin;}';
  document.getElementsByTagName('head')[0].appendChild(style);
  return styleClassName;
}

function calculateColor(percentageDistance) {
  //simple gradient algorith between two colors
  var red = percentageDistance * color1[0] + ((1 - percentageDistance) * color2[0]);
  var green = percentageDistance * color1[1] + ((1 - percentageDistance) * color2[1]);
  var blue = percentageDistance * color1[2] + ((1 - percentageDistance) * color2[2]);
  var color = [red, green, blue];
  return color;
}

function calculateGreyColor(percentageDistance) {
  //simple gradient algorith between two colors
  var red = percentageDistance * colorGrey1[0] + ((1 - percentageDistance) * colorGrey2[0]);
  var green = percentageDistance * colorGrey1[1] + ((1 - percentageDistance) * colorGrey2[1]);
  var blue = percentageDistance * colorGrey1[2] + ((1 - percentageDistance) * colorGrey2[2]);
  var color = [red, green, blue];
  return color;
}

// Make button work
document.getElementById('pan-up').addEventListener('click', function (e) {
  viewer.setPitch(viewer.getPitch() + 10);
});
document.getElementById('pan-down').addEventListener('click', function (e) {
  viewer.setPitch(viewer.getPitch() - 10);
});
document.getElementById('pan-left').addEventListener('click', function (e) {
  viewer.setYaw(viewer.getYaw() - 10);
});
document.getElementById('pan-right').addEventListener('click', function (e) {
  viewer.setYaw(viewer.getYaw() + 10);
});
document.getElementById('zoom-in').addEventListener('click', function (e) {
  viewer.setHfov(viewer.getHfov() - 10);
});
document.getElementById('zoom-out').addEventListener('click', function (e) {
  viewer.setHfov(viewer.getHfov() + 10);
});
document.getElementById('fullscreen').addEventListener('click', function (e) {
  viewer.toggleFullscreen();
});

/*document.getElementById('newPano').addEventListener('click', function (e) {
  if (videoPresent) {
    console.log("new Pano button clicked");
    let timestamp = document.getElementById('video').currentTime;
    var imageAlreadyAvailable = false;
    for (var i = 0; i < images.length; i++) {
      if (images[i].includes(timestamp)) {
        imageAlreadyAvailable = true;
      }
    }
    if (!imageAlreadyAvailable) {
      console.log("new image request");
      socket.emit("customImage", timestamp);
      socket.on("customImage", function (data) {
        if (data.includes("" + (timestamp))) {
          console.log("success");
          socket.off("customImage");
          setLinkToNewImg(data, timestamp);
//potential localization for new pano
          let keyframeIds = [];
          keyFrameManager.getAdjacentKeyframes(timestamp,5 ,keyframeIds);
          if(keyframeIds[0] === undefined && keyframeIds[1] === undefined) {
            console.log("could not find adjacent keyframes for " + timestamp + " and set distance 5");
          } else {
            console.log(keyFrameManager.getTimestamp(keyframeIds[0]) + "; " + timestamp + "; " + keyFrameManager.getTimestamp(keyframeIds[1]));
            let percentage = (timestamp - keyFrameManager.getTimestamp(keyframeIds[0]))/(keyFrameManager.getTimestamp(keyframeIds[1])-keyFrameManager.getTimestamp(keyframeIds[0]));
          }
        } else {
          console.log("not correct Image received: " + data);
        }
      });
    } else {
      console.log("image already available");
    }
  }
});*/

function setLinkToNewImg(path, secs) {
  //panoListLength+=1;
  //if(panoListLength > 0) {
  document.getElementById("createdPano").style.visibility = "visible";
  //}
  var li = document.createElement('li');
  li.id = "LiPano" + path;
  var time = "" + Math.floor(secs / 60) + ":";
  if (Math.floor(secs) % 60 < 10) {
    time += "0" + Math.floor(secs) % 60;
  } else {
    time += Math.floor(secs) % 60;
  }
  li.innerHTML += 'New Image at ' + time + ": ";
  var a = document.createElement('a');
  a.innerHTML = "Link";
  a.href = "pano.html?img=" + path.replace('./3dpano', '');
  a.target = "_blank";
  li.appendChild(a);
  var delBtn = document.createElement('button');
  delBtn.class = "deletePanoButton";
  delBtn.type = "button";
  delBtn.innerHTML = "Delete";
  delBtn.id = "del" + path;
  delBtn.addEventListener("click", function() {
    socket.emit("deleteCustomImage", path);
    socket.on("deleteCustomImage", function(result) {
      socket.off("deleteCustomImage");
      if(result === "success") {
        document.getElementById("LiPano"+path).remove();
      }
    });
  });
  insertAfter(delBtn, a);
  document.getElementById('olFrames').appendChild(li);
  //panoList.add("LiPano" + path);

  //calculatePositionForCreatedPano(path);
}

function setLinkToExistingImg(path, secs) {
  panoListLength += 1;
  if (panoListLength > 0) {
    document.getElementById("createdPano").style.visibility = "visible";
  }
  var li = document.createElement('li');
  var time = "" + Math.floor(secs / 60) + ":";
  if (Math.floor(secs) % 60 < 10) {
    time += "0" + Math.floor(secs) % 60;
  } else {
    time += Math.floor(secs) % 60;
  }
  li.innerHTML += 'Image at ' + time + " already exists: ";
  var a = document.createElement('a');
  a.innerHTML = "Link";
  a.href = "pano.html?img=" + path;
  a.target = "_blank";
  li.appendChild(a);
  document.getElementById('olFrames').appendChild(li);
}

function insertAfter(newNode, existingNode) {
  existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling);
}
document.getElementById('toggleHotspots').addEventListener('click', function(e) {
  if(hotspotsVisible) {
    hotspots.forEach(function(value, shot_id) {
      viewer.removeHotSpot(shot_id);
    },hotspots);
    newAddedHotspots.forEach(function(styleClass, shot_id) {
      viewer.removeHotSpot(shot_id);
    },newAddedHotspots);
    document.getElementById('toggleHotspots').innerHTML = "&#9711";
    hotspotsVisible = false;
  } else {
    hotspots.forEach(function(value, shot_id) {
      viewer.addHotSpot({"pitch": value[0], "yaw": value[1], "type": "info", "cssClass": value[2], "clickHandlerFunc": transition, "id": shot_id, "clickHandlerArgs": [value[0],value[1],shot_id + imageEnding, value[3]], "scale": true}, viewer.getScene());
    },hotspots);
    newAddedHotspots.forEach(function(value, shot_id) {
      viewer.addHotSpot({
        "pitch": value[0],
        "yaw": value[1],
        "type": "info",
        "cssClass": value[2],
        "id": shot_id,
        "URL": "/viewer/pano.html?img=" + imgPath + shot_id + imageEnding,
        "scale": true
  }, viewer.getScene());},newAddedHotspots);
    document.getElementById('toggleHotspots').innerHTML = "&#9673";
    hotspotsVisible = true;
  }
});
document.getElementById('toggleObjects').addEventListener('click', function(e) {
  if(objectsVisible) {
    objects.forEach(function(value, id) {
      viewer.removeHotSpot(id);
    }, objects);
    document.getElementById('toggleObjects').innerHTML = "&#9711";
    objectsVisible = false;
  } else {
    objects.forEach( function(value, id) {
      viewer.addHotSpot({"pitch": value[0], "yaw": value[1], "type": "info", "id": id,"cssClass": value[2], "createTooltipFunc": objectLabel, "createTooltipArgs": value[3], "scale": true});
    }, objects);
    document.getElementById('toggleObjects').innerHTML = "&#9673";
    objectsVisible = true;
  }
});


function normalizePath(path) {
  // remove multiple slashes
  path = path.replace(/\/+/g, '/');
  // remove leading slash, will be added further
  if (path.startsWith("/"))
      path = path.substring(1)
  // remove trailing slash
  if (path.endsWith("/"))
      path = path.slice(0, -1);
  let segments = path.split("/");
  let normalizedPath = "/";
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      if (segments[segmentIndex] === "." || segments[segmentIndex] === "") {
          // skip single dots and empty segments
          continue;
      }
      if (segments[segmentIndex] === "..") {
          // go up one level if possible
          normalizedPath = normalizedPath.substring(0, normalizedPath.lastIndexOf("/"));
          continue;
      }
      // append path segment
      if (!normalizedPath.endsWith("/"))
          normalizedPath = normalizedPath + "/"
      normalizedPath = normalizedPath + segments[segmentIndex];
  }
  return normalizedPath;
}
