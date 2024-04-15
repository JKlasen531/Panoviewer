window.addEventListener('message', (event) => {
	    var index;
	    var indexList;
	    var positions;
	    if(Array.isArray(event.data)) {
	    	if(Array.isArray(event.data[0])) {
	    	    positions = event.data;
	    	} else {
	    	    indexList = event.data;
	    	}
	    } else {
	        index = event.data;
	    }
	});
	

var params = new URLSearchParams(window.location.search);
var img = params.get('img');
var viewer;

//var thisShotCoords;

var minDistance = 0;
var maxDistance = Infinity;

//do less for better performance

var maxHotspots = Infinity;

var color1 = [0, 0, 255];
var color2 = [255, 0, 0];
var size1 = 15;
var size2 = 5;
var customSize = 20;

/*jQuery.getJSON(configFile, setConfig);

function setConfig(data) {
	maxHotspots = data['maxHotspots'];
	color1 = data['nearHotspotColor'];
	color2 = data['farHotspotColor'];
}*/

var closestHotspots = new Map();
var newAddedHotspots = new Map();
var hotspots = new Map();
var objects = new Map();
var scenes = new Set();
//var panoListLength = 0;
var hotspotsVisible = true;
//var objectsVisible = true;
var imageType = img.split('.')[1];
var imageEnding = "." + imageType;
var firstSceneName = img.replace(imageEnding,"");
var defaultHFov;
var minDistCss;
var maxDistCss;
var lastScene;
var isPanoSceneChanging = false;

// maybe grab those via php
//var imgWidth = 5760;
//var imgHeight = 2880;

	var objectsExist = false;

	//init();

	function init() {

		//init panellum viewer
		initViewer();

        //load reconstruction data
        /*viewer.on('load', function () {
            jQuery.getJSON(rec, setReconstructionData);
            firstLoad = false;
        });*/


		checkPhpSupport();
		initVideo();

		//check if objectives exist
        /*jQuery.getJSON(sourcePath + "objects/" + thisShot_id.replace(imageEnding, ".json"))
            .fail(function (jqxhr, textStatus, error) {
                if (jqxhr.status == 404) {
                    document.getElementById('toggleObjects').remove();
                    objectsExist = false;
                }
			});*/
        timeoutRotate = window.setTimeout(autoRotate, 7000);
    }

function initViewer() {
	viewer = pannellum.viewer('panorama', ﻿{
		"default": {
			"firstScene": "firstScene",
			"showControls": false,
			"sceneFadeDuration": 1000,
			"minHfov": 2,
			"maxHfov": 140,
		},
		"scenes": {
			"firstScene": {
				"panorama": img,
				"type": "equirectangular",
				"autoLoad": true
			}
		}
	});
}

function setReconstructionData(data) {
	viewer.off('load');
	if ('cameras' in data) {
        reconstructions = [data];
    } else {
        reconstructions = data;
    }
	reconstruction = reconstructions[0];
	
	hotspotsFromReconstruction();
}

	function hotspotsFromReconstruction() {
        thisShot = reconstruction['shots'][thisShot_id];
        thisShotInWorldCoords = shotPoseInWorldCoords(thisShot);
        calculateHotspots(reconstruction['shots']);
        sortHotspots();
        drawHotspots();
        if (objectsExist) {
            loadObjects();
        }
	}

// hotspot calculation cycle start
function calculateHotspots(shots) {
	for(var shot_id in shots) {
		if(shot_id.localeCompare(params.get('url')) == 0) {
		} else {
			calculateHotspotPosition(shot_id, shots[shot_id]);
		}
	}
}

function calculateHotspotPosition(shot_id, shot) {
	
	var camInWorld = shotPoseInWorldCoords(shot);
	
	//the vector from the shot of the panorama to the one, for that the hotspot is calculated; in world coordinates
	var dx = camInWorld.getComponent(0) - thisShotInWorldCoords.getComponent(0);
	var dy = camInWorld.getComponent(1) - thisShotInWorldCoords.getComponent(1);
	var dz = camInWorld.getComponent(2) - thisShotInWorldCoords.getComponent(2);
	var camDiff = new THREE.Vector3(dx, dy, dz);
	
	//transforms the vector into the coordinate system of the panorama shot
	var axis = new THREE.Vector3(thisShot.rotation[0],thisShot.rotation[1],thisShot.rotation[2]);
	var angle = axis.length();
    axis.normalize();
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
    camDiff.applyMatrix4(matrix);
	var x = camDiff.getComponent(0);
	var y = camDiff.getComponent(1);
	var z = camDiff.getComponent(2);
	
	var distance = Math.sqrt((x*x)+(y*y)+(z*z));
	
	//compare distance to the others
	if(distance > minDistance) {
		if(isCloser(distance)) {
			var pitch = 90 - Math.acos(-y / distance)*(180/Math.PI);
			var yaw = Math.atan2(x, z)*(180/Math.PI);
			var stats = [distance, yaw, pitch];
			closestHotspots.set(shot_id, stats);
		}
	}
}

function isCloser(distance) {
	var closer = false;
	if(closestHotspots.size < maxHotspots) {
		closer = true;
	} else {
		var furthest;
		closestHotspots.forEach(function(stats, shot_id) {
			if(furthest === undefined) {
				furthest = [shot_id, stats[0]];
			} else {
				if(furthest[1] < stats[0]) {
					furthest = [shot_id, stats[0]];
				}
			}
		});
		if(furthest[1] > distance) {
			closestHotspots.delete(furthest[0]);
			closer = true;
		}
	}
	return closer;
}

// hotspot calculcation cycle end

function sortHotspots() {
	closestHotspots = new Map([...closestHotspots.entries()].sort((a, b) => b[1][0] - a[1][0]));
}

function drawHotspots() {
	//creates custom css for each hotspot based on their distance
	
	//storing minimum and maximum distance relevant for the style classes
	maxDistCss = closestHotspots.values().next().value[0];
	minDistCss = maxDistCss;
	closestHotspots.forEach(function(stats, shot_id) {
		if(stats[0] < minDistCss) {
			minDistCss = stats[0];
		}
	}, closestHotspots);
	
	closestHotspots.forEach(function(stats, shot_id) {
		//in own method
		var shot = reconstruction['shots'][shot_id];
		if(shot.source != undefined) {
			var styleClassName = createBrightCss(shot_id, stats[0]);
			viewer.addHotSpot({
				"pitch": stats[2],
				"yaw": stats[1],
				"type": "info",
				"cssClass": styleClassName,
				"id": shot_id.replace(imageEnding,""),
				"URL": "/viewer/pano.html?img=" + imgPath + shot_id,
				"scale": true
			}, viewer.getScene());
		} else {
			var styleClassName = createCss(shot_id, stats[0]);
			link = imgPath + shot_id;
			viewer.addScene(shot_id,{
				"panorama": link,
				"type": "equirectangular"
			});
			viewer.addHotSpot({"pitch": stats[2], "yaw": stats[1], "type": "info","createTooltipFunc": setIcon, "cssClass": styleClassName,  "clickHandlerFunc": transition, "id": shot_id.replace(imageEnding,""), "clickHandlerArgs": [stats[2],stats[1],shot_id,stats[0]], "scale": true}, viewer.getScene());
			
			//hotspots array = (pitch, yaw, cssName, distance)
			hotspots.set(shot_id.replace(imageEnding,""),[stats[2],stats[1],styleClassName,stats[0]]);
		}
	}, closestHotspots);
}

function setIcon(hotSpotDiv, args) {
	hotSpotDiv.classList.add('foot-icon');
	var i = document.createElement('i');
	i.innerHTML = "";
	i.classList.add("fas");
	i.classList.add("fa-shoe-prints");
	i.classList.add("fa-rotate-270");
	i.style.fontSize = "10px"; //<- for adjusting size
	hotSpotDiv.appendChild(i);
	//fix size
}

function createCss(shot_id, distance) {
	var styleClassName = "hotspotCSS" + shot_id.replace(imageEnding,"").replace(".jpg","");
	var distanceRange = maxDistCss - minDistCss;
	var percentageDistance = (distance-minDistCss)/distanceRange;
	if(percentageDistance < 0) {
		percentageDistance = 0;
	} else if (percentageDistance > 1) {
		percentageDistance = 1;
	}
	var size = size1-((size1-size2)*percentageDistance); // size1 = 15, size2 = 5
	var color = calculateColor(percentageDistance);
	var style = document.createElement('style');
	style.id = styleClassName;
	style.type = 'text/css';
	style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px; background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] +',0.3); border-radius: 50%;border-color: #000000; border-style: solid; border-width: thin;}';
	document.getElementsByTagName('head')[0].appendChild(style);
	return styleClassName;
}

function createBrightCss(shot_id, distance) {
	var styleClassName = "hotspotCSS" + shot_id.replace(imageEnding,"");
	var distanceRange = maxDistCss - minDistCss;
	var percentageDistance = (distance-minDistCss)/distanceRange;
	if(percentageDistance < 0) {
		percentageDistance = 0;
	} else if (percentageDistance > 1) {
		percentageDistance = 1;
	}
	var size = customSize;//-(15*percentageDistance);
	var color = [255,255,0];//calculateColor(percentageDistance);
	var style = document.createElement('style');
	style.id = styleClassName;
	style.type = 'text/css';
	style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px; background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] +',1); border-radius: 50%;border-color: #000000; border-style: solid; border-width: thin;}';
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

	function transition(hotSpotDiv, args) {
		window.clearTimeout(timeoutRotate);
		isPanoSceneChanging = true;
			defaultHFov = 100;
			lastScene = viewer.getScene();
			var zoomHfov = (((40 - 70) / (maxDistCss - minDistCss)) * args[3] + (40 - ((((40 - 70) / (maxDistCss - minDistCss)) * maxDistCss))));
			viewer.lookAt(args[0], args[1], zoomHfov, 1000);
			viewer.on('animatefinished', function () {
				viewer.off('animatefinished');
				openPano(args[2]);
			});
}

/*
* This is used to get the vector from the current Hotspot to the parameter and returns the result with the two angles pitch and yaw
* It is used to calculate the cameraposition after opening a new Panorama
*/
function calculateOrientation(firstShot_id, nextShot_id) {
	var nextShot = reconstruction['shots'][nextShot_id];
	var nextShotInWorldCoords = shotPoseInWorldCoords(nextShot);
	var firstShot = reconstruction['shots'][firstShot_id];
	var firstShotInWorldCoords = shotPoseInWorldCoords(firstShot);
	var dx = nextShotInWorldCoords.getComponent(0) - firstShotInWorldCoords.getComponent(0);
	var dy = nextShotInWorldCoords.getComponent(1) - firstShotInWorldCoords.getComponent(1);
	var dz = nextShotInWorldCoords.getComponent(2) - firstShotInWorldCoords.getComponent(2);
	var nextShotVector = new THREE.Vector3(dx, dy, dz);
	var axis = new THREE.Vector3(nextShot.rotation[0],nextShot.rotation[1],nextShot.rotation[2]);
	var angle = axis.length();
	axis.normalize();
	var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
	nextShotVector.applyMatrix4(matrix);
	var x = nextShotVector.getComponent(0);
	var y = nextShotVector.getComponent(1);
	var z = nextShotVector.getComponent(2);
	
	var distance = Math.sqrt((x*x)+(y*y)+(z*z));
	var pitch = 90 - Math.acos(-y / distance)*(180/Math.PI);
	var yaw = Math.atan2(x, z)*(180/Math.PI);
	var result = [pitch, yaw];
	return result;
}

//same as calculateOrientation but returns the result as an x,y,z vector instead of pitch and yaw
function calculateOrientationAsVector(firstShot_id, nextShot_id) {
	var nextShot = reconstruction['shots'][nextShot_id];
	var nextShotInWorldCoords = shotPoseInWorldCoords(nextShot);
	var firstShot = reconstruction['shots'][firstShot_id];
	var firstShotInWorldCoords = shotPoseInWorldCoords(firstShot);
	var dx = nextShotInWorldCoords.getComponent(0) - firstShotInWorldCoords.getComponent(0);
	var dy = nextShotInWorldCoords.getComponent(1) - firstShotInWorldCoords.getComponent(1);
	var dz = nextShotInWorldCoords.getComponent(2) - firstShotInWorldCoords.getComponent(2);
	var nextShotVector = new THREE.Vector3(dx, dy, dz);
	var axis = new THREE.Vector3(nextShot.rotation[0],nextShot.rotation[1],nextShot.rotation[2]);
	var angle = axis.length();
	axis.normalize();
	var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
	nextShotVector.applyMatrix4(matrix);
	var x = nextShotVector.getComponent(0);
	var y = nextShotVector.getComponent(1);
	var z = nextShotVector.getComponent(2);
	
	var result = [x, y, z];
	return result;
}

/*
*  this function deletes the old Hotspots with their CSS classes
*  and calculates the new positions of the Hotspots.
*/
function openPano(shot_id) {
	var angle = calculateOrientation(thisShot_id, shot_id);
	var pitch = Math.round(angle[0]*100)/100;
	var yaw = Math.round(angle[1]*100)/100;
	viewer.on('scenechange', function() {
		viewer.off('scenechange');
		deleteOldHotspots();
		thisShot_id = shot_id;
		newAddedHotspots = new Map();
		hotspots = new Map();
		closestHotspots = new Map();
		objects = new Map();
		
        hotspotsFromReconstruction();
		if(videoFound) {
			setVideoTimeToShot(thisShot_id.replace(imageEnding,""));
		}
		isPanoSceneChanging = false;
        timeoutRotate = window.setTimeout(autoRotate, 7000);
	});
	viewer.loadScene(shot_id, pitch, yaw, defaultHFov);
}

/*
*  Deletes the current Hotspots and their CSS Classes.
*/
function deleteOldHotspots() {
	hotspots.forEach(function(stats, shot_id) {
		viewer.removeHotSpot(shot_id, lastScene);
		document.getElementById("hotspotCSS" + shot_id.replace(imageEnding,"")).remove();
	},hotspots);
	hotspots = new Map();
}

/*
* Calculates the shot position from the reconstruction in world coordinates.
* If you want to get a better understanding of how and why that works, you should
* look up the conventions for the data in opensfm as used in the reconstruction.json .
*/
function shotPoseInWorldCoords(shot) {
    var angleaxis = [-shot.rotation[0],
        -shot.rotation[1],
        -shot.rotation[2]];
    var Rt = rotate(shot.translation, angleaxis);
    Rt.negate();
    return Rt;
}

function rotate(vector, angleaxis) {
    var v = new THREE.Vector3(vector[0], vector[1], vector[2]);
    var axis = new THREE.Vector3(angleaxis[0],
        angleaxis[1],
        angleaxis[2]);
    var angle = axis.length();
    axis.normalize();
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
    v.applyMatrix4(matrix);
    return v;
}

function worldPoseInShotCoords(worldPose, rotation) {
	worldPose.negate();
	var angleaxis = [-rotation[0],
        -rotation[1],
        -rotation[2]];
	var worldPoseAsArray = [worldPose.getComponent(0), worldPose.getComponent(1), worldPose.getComponent(2)];
	var Rt = invertRotate(worldPoseAsArray, angleaxis);
    return Rt;
}

function invertRotate(vector, angleaxis) {
    var v = new THREE.Vector3(vector[0], vector[1], vector[2]);
    var axis = new THREE.Vector3(angleaxis[0],
        angleaxis[1],
        angleaxis[2]);
    var angle = axis.length();
    axis.normalize();
	
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
	var inverseMatrix = new THREE.Matrix4();
	inverseMatrix.getInverse(matrix);
    v.applyMatrix4(inverseMatrix);
    return v;
}

// functions for displaying objects from the json

function loadObjects() {
	jQuery.getJSON(sourcePath + "objects/" + thisShot_id.replace(imageEnding,".json"), showObjects);
}

function showObjects(data,status,xhr) {
	data['objects'].forEach(function(val, index, array) {
		//value['label']
		value = val['box']
		xMiddle = parseInt(value['xmin']) + ((parseInt(value['xmax']) - parseInt(value['xmin']))/2);
		yMiddle = parseInt(value['ymin']) + ((parseInt(value['ymax']) - parseInt(value['ymin']))/2);
		normXMid = xMiddle - (imgWidth/2);
		normYMid = -(yMiddle - (imgHeight/2));
		yaw = normXMid/(imgWidth/2)*180;
		pitch = normYMid/(imgHeight/2)*90;
		xDif = parseInt(parseInt(value['xmax']) - parseInt(value['xmin']));
		yDif = parseInt(parseInt(value['ymax']) - parseInt(value['ymin']));
		cssName = createObjectCss(xDif*yDif, index, val['label']);
		viewer.addHotSpot({"pitch": pitch, "yaw": yaw, "type": "info", "id": "obj" + val['label'] + index,"cssClass": cssName, "createTooltipFunc": objectLabel, "createTooltipArgs": val['label'], "scale": true});
		objects.set("obj" + val['label'] + index, [pitch, yaw, cssName, val['label']]);
	});
}

function objectLabel(hotSpotDiv, args) {
		hotSpotDiv.classList.add("objectLabel");
		var span = document.createElement('span');
		span.innerHTML = args;
		hotSpotDiv.appendChild(span);
		span.style.width = span.scrollWidth-20+'px';
		span.style.marginLeft = -(span.scrollWidth-hotSpotDiv.offsetWidth)/2+'px';
		span.style.marginTop = -span.scrollHeight-12+20+'px';
}

function createObjectCss(size, index, label) {
	var styleClassName = label+index;
	var size = (20/190000)*size+(23.95);
	var color = [55,227,51];
	var style = document.createElement('style');
	style.id = styleClassName;
	style.type = 'text/css';
	style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px; background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] +',0.5); border-color: #000000; border-style: solid; border-width: thin;}';
	//style.innerHTML = '.' + styleClassName + '{ height: ' + size + 'px; width: ' + size + 'px; background:rgba(' + color[0] + ',' + color[1] + ',' + color[2] +',0.5); border-color:rgba(' + color[0] + ',' + color[1] + ',' + color[2] +',0.5); border-style: solid; border-width: thin;}';
	document.getElementsByTagName('head')[0].appendChild(style);
	return styleClassName;
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

//VideoScript

var isPlaying = false;
var vid = document.getElementById('video');
var phpSupported = true;
var videoFound = true;

    function checkPhpSupport() {
        $.ajax({
            type: "POST",
            url: "test.php",
        }).done(function () {
        }).fail(function () {
            ;
            phpSupported = false;
            videoFound = false;
            document.getElementById('vidCtrl').remove();
            document.getElementById('createdPanos').remove();
        });
    }

	function initVideo() {
        var phpScript = "getVidExt.php?vidFolder=" + vidPath + videoFileName;
		$.ajax({
			type: "GET",
			url: phpScript,
		}).done(function (data) {
			console.log('vidAjaxSent');
			var result = JSON.parse(data);
			console.log(result);
			vidFileEnding = result.extensionVideo;
			lowResVidFileEnding = result.extensionLowResVideo;
			if (vidFileEnding == "noExtension" && lowResVidFileEnding == "noExtension") {
				console.log('noextensionx2');
			} else if (vidFileEnding == "noExtension") {
				document.getElementById("newPano").disabled = true;
				var req = new XMLHttpRequest();
				req.open('GET', sourcePath + 'videos/' + videoFileName + '_low_res.' + lowResVidFileEnding, true);
				req.responseType = 'blob';
				req.onload = function () {
                    if (this.status === 200) {
                        var videoBlob = this.response;
                        var video = URL.createObjectURL(videoBlob);
                        vid.src = video;
						setVideoTimeToShot(thisShot_id.replace(imageEnding, ""));
						addVidListeners();
                    } else {
                        //video was not found, remove video player
                        videoFound = false;
                        document.getElementById('vidCtrl').remove();
                        document.getElementById('createdPanos').remove();
                    }
				}
				req.onerror = function () {
					console.log("AjaxReq for Vid: an error has occured");
				}
				req.send();
			} else {
				var req = new XMLHttpRequest();
				req.open('GET', sourcePath + 'videos/' + videoFileName + '_low_res.' + lowResVidFileEnding, true);
				req.responseType = 'blob';
				req.onload = function () {
                    if (this.status === 200) {
                        var videoBlob = this.response;
                        var video = URL.createObjectURL(videoBlob);
                        vid.src = video;
						setVideoTimeToShot(thisShot_id.replace(imageEnding, ""));
						addVidListeners();
                    } else {
                        //video was not found, remove video player
                        videoFound = false;
                        document.getElementById('vidCtrl').remove();
                        document.getElementById('createdPanos').remove();
                    }
				}
				req.onerror = function () {
					console.log("AjaxReq for Vid: an error has occured");
				}
				req.send();
			}
		});
	}

function autoRotate() {
	viewer.startAutoRotate(20);//adjustable speed and pitch
}

	function vidTransition(event) {
		if (!isPanoSceneChanging) {
			window.clearTimeout(timeoutRotate);
		var frameNr = vid.currentTime * 29.97;
		//get nearest scene and open it
		var closestHotspot;
		var distance = Infinity;
		closestHotspots.forEach(function (stats, shot_id) {
			var hotspotFrameNr = parseInt(shot_id.replace(imageEnding, "").replace(preImgName, ""));
			if (Math.abs(hotspotFrameNr - frameNr) < distance) {
				closestHotspot = [stats[2], stats[1], shot_id, stats[0]];
				distance = Math.abs(hotspotFrameNr - frameNr);
			}
		}, closestHotspots);
		defaultHFov = 100;
		lastScene = viewer.getScene();
		var zoomHfov = (((40 - 70) / (maxDistCss - minDistCss)) * closestHotspot[3] + (40 - ((((40 - 70) / (maxDistCss - minDistCss)) * maxDistCss))));
		var turning = Math.sqrt((viewer.getPitch() - closestHotspot[0]) * (viewer.getPitch() - closestHotspot[0])
			+ ((viewer.getYaw() - closestHotspot[1]) * (viewer.getYaw() - closestHotspot[1])));
		var time = (turning * (500 / 90)) + 1000;
		viewer.lookAt(closestHotspot[0], closestHotspot[1], zoomHfov, time);
		viewer.on('animatefinished', function () {
			viewer.off('animatefinished');
			var angle = calculateOrientation(thisShot_id, closestHotspot[2]);
			var pitch = Math.round(angle[0] * 100) / 100;
			var yaw = Math.round(angle[1] * 100) / 100;
			viewer.on('scenechange', function () {
				viewer.off('scenechange');
				deleteOldHotspots();
				thisShot_id = closestHotspot[2];
				newAddedHotspots = new Map();
				hotspots = new Map();
				closestHotspots = new Map();
				objects = new Map();

				thisShot = reconstruction['shots'][thisShot_id];
				thisShotInWorldCoords = shotPoseInWorldCoords(thisShot);

				calculateHotspots(reconstruction['shots']);
				sortHotspots();
				drawHotspots();
				loadObjects();
                timeoutRotate = window.setTimeout(autoRotate, 7000);
				if (videoFound) {
					//setVideoTimeToShot(thisShot_id.replace(imageEnding,""));
				}
			});
			viewer.loadScene(closestHotspot[2], pitch, yaw, defaultHFov);
		});
	}
}

function setVideoTimeToShot(shot_id) {
	var vidFps = 29.97;
	var frame = shot_id.replace("360_","");
	var time = frame * (1/vidFps);
	vid.currentTime = time;
}

document.getElementById('newPano').addEventListener('click', function(e) {
	takeImgFromVid(vid.currentTime);
});

function takeImgFromVid(secs) {
	var sec = Math.round((secs)*1000)/1000;
	//adapt
	$.ajax({
		type: "POST",
        url: "ImgFromVid.php?vid=" + sourcePath + "videos/" + videoFileName +"."+ vidFileEnding +"&secs=" + sec+"&type=" + imageType+"&imgFolder="+imgPath,
	}).done(function(data) {
		var result = JSON.parse(data)
		if(result.code == 0) {
			setLinkToNewImg(result.file_url, sec);
		} else {
			setLinkToExistingImg(result.file_url, sec);
		}
	});
}

function setLinkToNewImg(path, secs) {
	panoListLength+=1;
	if(panoListLength > 0) {
		document.getElementById("createdPano").style.visibility = "visible";
	}
	var li = document.createElement('li');
	li.id = "LiPano"+path;
	var time = "" + Math.floor(secs/60) +":";
	if(Math.floor(secs)%60 < 10) {
		time += "0" + Math.floor(secs)%60;
	} else {
		time += Math.floor(secs)%60;
	}
	li.innerHTML += 'New Image at ' + time + ": ";
	var a = document.createElement('a');
	a.innerHTML = "Link";
	a.href = "pano.html?img=" + path;
	a.target = "_blank";
	li.appendChild(a);
	var delBtn = document.createElement('button');
	delBtn.class = "deletePanoButton";
	delBtn.type = "button";
	delBtn.innerHTML = "Delete";
	delBtn.id = "del" + path;
	delBtn.addEventListener("click", function() {
		deletePano(path);
	});
	insertAfter(delBtn, a);
	document.getElementById('olFrames').appendChild(li);
	//panoList.add("LiPano" + path);
	
	calculatePositionForCreatedPano(path);
}

function setLinkToExistingImg(path, secs) {
	panoListLength+=1;
	if(panoListLength > 0) {
		document.getElementById("createdPano").style.visibility = "visible";
	}
	var li = document.createElement('li');
	var time = "" + Math.floor(secs/60) +":";
	if(Math.floor(secs)%60 < 10) {
		time += "0" + Math.floor(secs)%60;
	} else {
		time += Math.floor(secs)%60;
	}
	li.innerHTML += 'Image at ' + time + " already exists: ";
	var a = document.createElement('a');
	a.innerHTML = "Link";
	a.href = "pano.html?img=" + path;
	a.target = "_blank";
	li.appendChild(a);
	document.getElementById('olFrames').appendChild(li);
}

function calculatePositionForCreatedPano(path) {

	//determine the next and the image before the new one
	//var imgPath = path.replace(imgPath + "360_", "");
	var imgPath = path.replace(sourcePath + "images/360_", "");
	var frameNr = imgPath.replace(imageEnding, "");
	var next;
	var nextAbs = Infinity;
	var before;
	var beforeAbs = Infinity;
	
	//before calculation wrong
	for(var shot_id in reconstruction['shots']) {
		var shot = reconstruction['shots'][shot_id];
			if(shot.source === undefined) {
			var framenmr = shot_id.replace("360_","");
			framenmr = framenmr.replace(imageEnding,"");
			if(framenmr > frameNr) {
				if((parseInt(framenmr) - parseInt(frameNr)) < nextAbs) {
					nextAbs = parseInt(framenmr) - parseInt(frameNr);
					next = shot_id;
				}
			}
	
			if(framenmr < frameNr) {
				if((parseInt(-framenmr) + parseInt(frameNr)) < beforeAbs) {
					beforeAbs = parseInt(-framenmr) + parseInt(frameNr);
					before = shot_id;
				}
			}
		}
	}
	
	var shot_id = "360_" + frameNr + imageEnding;
	
	//calculates the new translation by interpolating between the previous selected shots
	var diff = nextAbs + beforeAbs;
	var value = beforeAbs/diff;
	var shotBefore = reconstruction['shots'][before];
	var shotNext = reconstruction['shots'][next];
	var pos0 = shotPoseInWorldCoords(shotBefore);
	var pos1 = shotPoseInWorldCoords(shotNext);
	var interpolX = value * pos0.getComponent(0) + ((1 - value) * pos1.getComponent(0));
	var interpolY = value * pos0.getComponent(1) + ((1 - value) * pos1.getComponent(1));
	var interpolZ = value * pos0.getComponent(2) + ((1 - value) * pos1.getComponent(2));
	var worldPos = new THREE.Vector3(interpolX, interpolY, interpolZ);
	
	//rotation is also calculated by interpolation
	var rotX = value * shotBefore.rotation[0] + ((1 - value ) * shotNext.rotation[0]);
	var rotY = value * shotBefore.rotation[1] + ((1 - value ) * shotNext.rotation[1]);
	var rotZ = value * shotBefore.rotation[2] + ((1 - value ) * shotNext.rotation[2]);
	
	//as opensfm wants their shots to give in the translation the vector from the origin of the shot coordinate system to the origin of the  global coordinate system
	//in shot coordinates, we calculate that
	var newRot = [rotX, rotY, rotZ];
	var newTra = worldPoseInShotCoords(worldPos, newRot);
	var newShot = {
		translation: [
			newTra.getComponent(0),
			newTra.getComponent(1),
			newTra.getComponent(2)
		], 
		rotation : [
			rotX,
			rotY,
			rotZ
		],
		camera: "v2 unknown unknown 5760 2880 spherical 0 rgb",
        orientation: 1,
        capture_time: 0.0,
        gps_dop: 999999.0,
        gps_position: [
            0.0,
            0.0,
            0.0
        ],
        vertices: [],
        faces: [],
        scale: 1.0,
        covariance: [],
        merge_cc: 0,
		source: "3DPano"
	};
	
	//write new shot to reconstruction json
	reconstruction['shots'][shot_id] = newShot;
	
	var newPos = new THREE.Vector3(interpolX, interpolY, interpolZ);
	
	//next we calculate the position of the new pano for pannellum
	var vectorNewPosToThisPano = new THREE.Vector3(newPos.getComponent(0) - thisShotInWorldCoords.getComponent(0),
		newPos.getComponent(1) - thisShotInWorldCoords.getComponent(1),
		newPos.getComponent(2) - thisShotInWorldCoords.getComponent(2));
	var axis = new THREE.Vector3(thisShot.rotation[0],thisShot.rotation[1],thisShot.rotation[2]);
	var angle = axis.length();
    axis.normalize();
    var matrix = new THREE.Matrix4().makeRotationAxis(axis, angle);
    vectorNewPosToThisPano.applyMatrix4(matrix);
	var x = vectorNewPosToThisPano.getComponent(0);
	var y = vectorNewPosToThisPano.getComponent(1);
	var z = vectorNewPosToThisPano.getComponent(2);
	var distance = Math.sqrt((x*x)+(y*y)+(z*z));
	var pitch = 90 - Math.acos(-y / distance)*(180/Math.PI);
	var yaw = Math.atan2(x, z)*(180/Math.PI);
	
	//create css for this hotspot
	var styleClassName = createBrightCss(shot_id, distance);
	/*viewer.addScene(shot_id,{
		"panorama": imgPath + shot_id,
		"type": "equirectangular"
	});*/
	newAddedHotspots.set(shot_id.replace(imageEnding,""), [pitch, yaw, styleClassName]);
	viewer.addHotSpot({
	"pitch": pitch,
	"yaw": yaw,
	"type": "info",
	"cssClass": styleClassName,
	"id": shot_id.replace(imageEnding,""),
	"URL": "/viewer/pano.html?img=" + path,
	"scale": true
	}, viewer.getScene());
	//hotspots.set(shot_id.replace(imageEnding,""),[pitch,yaw,styleClassName,distance]);
	//prolly remove orientation calculation part and just open link w/ new hotspot
	$.ajax({
		type: "POST",
		url: "localizeImages.php?panoId=" + path + "&interpol=" +
			Math.round(newTra.getComponent(0)*100)/100 + "," +
			Math.round(newTra.getComponent(1)*100)/100 + "," +
			Math.round(newTra.getComponent(2)*100)/100,
	}).done(function(data) {
	});
}

function imgInList(path) {
	return false;//panoList.has("LiPano" + path);
}

function deletePano(panoPath) {
	$.ajax({
		type: "POST",
		url: "deleteImgFromVid.php?img=" + panoPath,
	}).done(function(data) {
		document.getElementById("LiPano"+panoPath).remove();
		newAddedHotspots.delete(panoPath.replace(imgPath,""));
		//delete style class
		var img = panoPath.replace(sourcePath + "images/","");
		viewer.removeHotSpot(img.replace(imageEnding,""));
		delete reconstruction['shots'][panoPath.replace(imgPath,"")];
		viewer.removeScene(panoPath.replace(imgPath,""));
		panoListLength-=1;
		if(panoListLength < 1) {
			document.getElementById("createdPano").style.visibility = "hidden";
		}
	});
	$.ajax({
		type: "POST",
		url: "delFromLocalize.php?panoId=" + panoPath
	}).done(function(data) {
	});
}

function insertAfter(newNode, existingNode) {
	existingNode.parentNode.insertBefore(newNode, existingNode.nextSibling);
	}

	function addVidListeners() {
        vid.addEventListener('pause', vidPaused);
        vid.addEventListener('play', vidPlaying);
	}

    var timeoutPlay;
    var timeoutRotate;

	function vidPlaying(event) {
		console.log("Video starts playing");
        window.clearTimeout(timeoutRotate);
        viewer.stopAutoRotate();
        timeoutPlay = window.setTimeout(openNextPano, 5000);
    }

    function openNextPano() {
        vidTransition(null);
        if (!vid.paused) {
            timeoutPlay = window.setTimeout(openNextPano, 7000);
        }
    }

	function vidPaused(event) {
		console.log("Video paused");
        window.clearTimeout(timeoutPlay);
        timeoutRotate = window.setTimeout(autoRotate, 7000);
        vidTransition(event);
	}

	viewer.on('mousedown', function (e) {
        window.clearTimeout(timeoutRotate);
	});

	viewer.on('mouseup', function (e) {
        timeoutRotate = window.setTimeout(autoRotate, 7000);
    });
