class PointManager {
    constructor() {

        this.points = new Map();

        this.totalPointCnt = 0;  // number of drew point, increase only
        this.nValidPoint = 0;  // number of points in SLAM
        this.vertexIds = {};  // vertex(Viewer上の点)のIDのリスト，3D点のIDで参照可能
        this.discardedPool = [];  // points removed from SLAM are not removed in viewer, will be reused when new point added
        this.discardedPoolSize = 0; // size of discardedPool

        this.prevReferencePointIds = [];

        this.POOL_POINT_COORDS = [0, 0, -100000]; // position of pooled point
    }


    // private methods
    addPoint(id, x, y, z, r, g, b) {
        // calc point coordinate
        let vector = new THREE.Vector3();
        vector.x = x;
        vector.y = y;
        vector.z = z;

        if (this.discardedPoolSize > 0) {
            let vertexId = this.discardedPool.pop();
            this.vertexIds[id] = vertexId;
            this.discardedPoolSize--;

            this.points.set(this.vertexIds[id], [x,y,z,r,g,b]);

        } else {

            this.vertexIds[id] = this.totalPointCnt;
            this.totalPointCnt++;

            this.points.set(this.vertexIds[id], [x,y,z,r,g,b]);
        }
    }

    changePointPos(id, x, y, z) {
        var values = this.points.get(this.vertexIds[id]);
        this.points.set(this.vertexIds[id], [x, y, z, values[3], values[4], values[5]]);
    }

    changePointColor(id, r, g, b) {
        var values = this.points.get(this.vertexIds[id]);
        this.points.set(this.vertexIds[id], [values[0], values[1], values[2], r, g, b]);
    }


    // public methods
    updatePoint(id, x, y, z, r, g, b) {

        if (this.vertexIds[id] === undefined || this.vertexIds[id] < 0) {
            this.addPoint(id, x, y, z, r, g, b);
            this.nValidPoint++;
        } else {
            this.changePointPos(id, x, y, z);
            this.changePointColor(id, r, g, b);
        }
    }

    removePoint(id) {
        if (!(id in this.vertexIds)) {
            return;
        }
        
        let vertexIdx = this.vertexIds[id];
        // Do nothing if point has been already removed.
        if (vertexIdx < 0) {
            return;
        }
        
        this.points.delete(vertexIdx);
        this.vertexIds[id] = -1;
        this.discardedPool.push(vertexIdx);
        this.discardedPoolSize++;
        this.nValidPoint--;
    }

    colorizeReferencePoints(referencePointIds) {

        /*for (let id of referencePointIds) {
            pointCloud.changePointColor(id, REFERENCE_POINT_COLOR[0], REFERENCE_POINT_COLOR[1], REFERENCE_POINT_COLOR[2]);
            this.prevReferencePointIds.splice(id, 1);

        }
        for (let id of this.prevReferencePointIds) {
            let color = this.pointColors[id];
            if (color !== undefined) {
                pointCloud.changePointColor(id, color[0], color[1], color[2]);
            }
        }
        this.prevReferencePointIds = referencePointIds;*/
    }

}
