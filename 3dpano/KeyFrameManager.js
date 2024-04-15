/**
* A utility class to manage keyframes, similar to KeyFrames.js from the socket viewer
*/
class KeyFrameManager {
    constructor() {
        this.keyframeIndices = [];
        this.keyframePosition = [];
        this.keyframePoses = [];
        this.addedKeyframeIndices = [];
        this.keyframeSrcFrmId = [];  //this.keyframeTimestamp
        this.removedPool = [];
        this.removedPoolSize = 0;
        this.POOL_KEYFRAME_POSE = [[1, 0, 0, 0], [0, 1, 0, -100000], [0, 0, 1, 0]];
        this.totalFrameCount = 0;
    }

    poseToTrans(index, pose_) {
        if (pose_[3] !== undefined) {
            let matrix = new THREE.Matrix4();
            matrix.set(pose_[0][0], pose_[0][1], pose_[0][2], pose_[0][3],
                pose_[1][0], pose_[1][1], pose_[1][2], pose_[1][3],
                pose_[2][0], pose_[2][1], pose_[2][2], pose_[2][3],
                pose_[3][0], pose_[3][1], pose_[3][2], pose_[3][3]);
            let matrix2 = new THREE.Matrix4().getInverse(matrix);
            this.keyframePosition[index] = matrix2.elements;
        }
    }

    addKeyframe(id, pose, srcfrmid) {

        if (this.removedPoolSize > 0) {
            let index = this.removedPool.pop();
            this.removedPoolSize--;

            this.keyframeIndices[id] = index;
            this.changeKeyframePos(index, pose, srcfrmid);
        }
        else {

            this.keyframeIndices[id] = this.totalFrameCount;
            this.addedKeyframeIndices.push(this.totalFrameCount);
            this.keyframePoses[this.totalFrameCount] = pose;
            this.poseToTrans(this.totalFrameCount, pose);
            this.keyframeSrcFrmId[this.totalFrameCount] = srcfrmid;
            this.totalFrameCount++;
        }
        this.numValidKeyframe++;
    }

    removeKeyframe(id) {
        let index = this.keyframeIndices[id];

        if (this.keyframeIndices[id] < 0 || index === undefined)
            return;

        this.changeKeyframePos(index, this.POOL_KEYFRAME_POSE);
        this.keyframeSrcFrmId[index] = -1;

        this.keyframeIndices[index] = -1;
        this.removedPool.push(index);
        this.removedPoolSize++;

        this.numValidKeyframe--;
    }

    getIdBySrcFrmId(srcfrmid) {
        let id = undefined;
        for (let i = 0; i < this.keyframeIndices.length; i++) {
            if (this.keyframeSrcFrmId[this.keyframeIndices[i]] === srcfrmid) {
                id = i;
                return id;
            }
        }
        return id;
    }

    getSrcFrmId(id) {
        return this.keyframeSrcFrmId[this.keyframeIndices[id]];
    }

    changeKeyframePos(index, pose, srcfrmid) {
        this.keyframePoses[index] = pose;
        this.poseToTrans(index, pose);
        this.keyframeSrcFrmId[index] = srcfrmid;
    }

    updateKeyframe(id, pose, srcfrmid) {
        let index = this.keyframeIndices[id];
        if (index < 0 || index === undefined) {
            this.addKeyframe(id, pose, srcfrmid);
        }
        else {
            this.changeKeyframePos(index, pose, srcfrmid);
        }
    }

    getUpdatedKeyframes(updatedIds_, keyframes_) {
        for (var i = 0; i < updatedIds_.length; i++) {
            if (this.keyframeIndices[updatedIds_[i]] >= 0 && this.keyframeIndices[updatedIds_[i]] !== undefined) {
                keyframes_.set(updatedIds_[i], this.keyframePosition[this.keyframeIndices[updatedIds_[i]]]);
            } else {
                keyframes_.set(updatedIds_[i], undefined);
            }
        }
    }

    getUpdatedSrcFrmIds(updatedIds_, srcfrmids_) {
        for (var i = 0; i < updatedIds_.length; i++) {
            if (this.keyframeIndices[updatedIds_[i]] >= 0 && this.keyframeIndices[updatedIds_[i]] !== undefined) {
                srcfrmids_.set(updatedIds_[i], this.keyframeSrcFrmId[this.keyframeIndices[updatedIds_[i]]]);
            }
        }
    }

    getKeyframeSrcFrmId(id) {
        if (this.keyframeIndices[id] !== undefined && this.keyframeIndices[id] >= 0) {
            return this.keyframeSrcFrmId[this.keyframeIndices[id]];
        } else {
            return undefined;
        }
    }

    srcFrmIdsAsArray(a_) {
        for (var i = 0; i < this.keyframeIndices.length; i++) {
            if (this.keyframeIndices[i] >= 0) {
                a_[i] = this.keyframeSrcFrmId[this.keyframeIndices[i]];
            }
        }
    }

    localize(id) {
        if (this.keyframeIndices[id] !== undefined && this.keyframeIndices[id] >= 0) {
            return this.keyframePosition[this.keyframeIndices[id]];
        } else {
            return undefined;
        }
    }
    
    getAdjacentKeyframes(srcfrmid, maxDist ,keyframeIds) {
      let leftAdjacent;
      let rightAdjacent
      let leftDistance;
      let rightDistance;
      for (var i = 0; i < this.keyframeIndices.length; i++) {
        if(this.keyframeSrcFrmId[this.keyframeIndices[i]] <= srcfrmid) {
          let newDist = Math.abs(this.keyframeSrcFrmId[this.keyframeIndices[i]] - srcfrmid);
          if((newDist < leftDistance && newDist <= maxDist) || (leftDistance === undefined && newDist <= maxDist)) {
            leftDistance = newDist;
            leftAdjacent = i;
          }
        }
        if(this.keyframeSrcFrmId[this.keyframeIndices[i]] > srcfrmid) {
          let newDist = Math.abs(this.keyframeSrcFrmId[this.keyframeIndices[i]] - srcfrmid);
          if((newDist < rightDistance && newDist <= maxDist) || (rightDistance === undefined && newDist <= maxDist)) {
            rightDistance = newDist;
            rightAdjacent = i;
          }
        }
      }
      keyframeIds.push(leftAdjacent);
      keyframeIds.push(rightAdjacent);
    }

    asMap(map_) {
        var map = new Map();
        for (var i = 0; i < this.keyframeIndices.length; i++) {
            if (this.keyframeIndices[i] >= 0) {
                map_.set(i, this.keyframePosition[this.keyframeIndices[i]]);
            }
        }
        //map_ = map;
    }
}
