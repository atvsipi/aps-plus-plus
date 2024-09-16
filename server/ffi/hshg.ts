const MAX_OBJECT_CELL_DENSITY = 1 / 8; // objects / cells
const INITIAL_GRID_LENGTH = 256; // 16x16
const HIERARCHY_FACTOR = 2;
const HIERARCHY_FACTOR_SQRT = Math.SQRT2;

type Point = [number, number];

interface AABB {
    getAABB: () => {
        active: boolean;
        min: Point;
        max: Point;
    };
    HSHG?: {
        globalObjectsIndex: number;
        objectContainerIndex?: number;
        allGridObjectsIndex?: number;
        grid?: Grid;
        hash?: number;
    };
}

type Offset = [number, number, number, number, number, number, number, number, number] | [];

function testAABBOverlap(objA: AABB, objB: AABB): boolean {
    var a = objA.getAABB(),
        b = objB.getAABB();

    if (!a.active && !b.active) return false;

    if (a.min[0] > b.max[0] || a.min[1] > b.max[1] || a.max[0] < b.min[0] || a.max[1] < b.min[1]) {
        return false;
    } else {
        return true;
    }
}

function getLongestAABBEdge(min: Point, max: Point) {
    return Math.max(Math.abs(max[0] - min[0]), Math.abs(max[1] - min[1]));
}

export class HSHG {
    private _grids: Grid[];
    private _globalObjects: AABB[];

    constructor() {
        this._grids = [];
        this._globalObjects = [];
    }

    addObject(obj: AABB) {
        var objAABB = obj.getAABB(),
            objSize = getLongestAABBEdge(objAABB.min, objAABB.max),
            newGrid: Grid;

        obj.HSHG = {
            globalObjectsIndex: this._globalObjects.length,
        };

        this._globalObjects.push(obj);

        if (this._grids.length == 0) {
            const cellSize = objSize * HIERARCHY_FACTOR_SQRT;
            const newGrid = new Grid(cellSize, INITIAL_GRID_LENGTH, this);
            newGrid.initCells();
            newGrid.addObject(obj);

            this._grids.push(newGrid);
        } else {
            let x = 0;

            for (let i = 0; i < this._grids.length; i++) {
                const oneGrid = this._grids[i];
                let x = oneGrid.cellSize;
                if (objSize < x) {
                    x = x / HIERARCHY_FACTOR;
                    if (objSize < x) {
                        while (objSize < x) {
                            x = x / HIERARCHY_FACTOR;
                        }
                        newGrid = new Grid(x * HIERARCHY_FACTOR, INITIAL_GRID_LENGTH, this);
                        newGrid.initCells();
                        newGrid.addObject(obj);
                        this._grids.splice(i, 0, newGrid);
                    } else {
                        oneGrid.addObject(obj);
                    }
                    return;
                }
            }

            while (objSize >= x) {
                x = x * HIERARCHY_FACTOR;
            }

            newGrid = new Grid(x, INITIAL_GRID_LENGTH, this);
            newGrid.initCells();
            newGrid.addObject(obj);
            this._grids.push(newGrid);
        }
    }
    checkIfInHSHG(obj: AABB) {
        var meta = obj.HSHG;

        if (meta === undefined) return false;
        return true;
    }
    removeObject(obj: AABB) {
        var meta = obj.HSHG,
            globalObjectsIndex: number,
            replacementObj: AABB;

        if (meta === undefined) {
            throw Error(obj + ' was not in the HSHG.');
        }

        globalObjectsIndex = meta.globalObjectsIndex;
        if (globalObjectsIndex === this._globalObjects.length - 1) {
            this._globalObjects.pop();
        } else {
            replacementObj = this._globalObjects.pop()!;
            replacementObj.HSHG!.globalObjectsIndex = globalObjectsIndex;
            this._globalObjects[globalObjectsIndex] = replacementObj;
        }

        meta!.grid!.removeObject(obj);

        delete obj.HSHG;
    }
    update() {
        this.update_RECOMPUTE.call(this);
    }
    queryForCollisionPairs() {
        let possibleCollisions: [AABB, AABB][] = [];

        for (let i = 0; i < this._grids.length; i++) {
            const grid = this._grids[i];

            for (let j = 0; j < grid.occupiedCells.length; j++) {
                const cell = grid.occupiedCells[j];

                for (let k = 0; k < cell.objectContainer.length; k++) {
                    const objA = cell.objectContainer[k];
                    if (!objA.getAABB().active) continue;
                    for (let l = k + 1; l < cell.objectContainer.length; l++) {
                        const objB = cell.objectContainer[l];
                        if (!objB.getAABB().active) continue;
                        if (testAABBOverlap(objA, objB) === true) {
                            possibleCollisions.push([objA, objB]);
                        }
                    }
                }

                for (let c = 0; c < 4; c++) {
                    const offset = cell.neighborOffsetArray[c];

                    const adjacentCell = grid.allCells[cell.allCellsIndex! + offset];

                    for (let k = 0; k < cell.objectContainer.length; k++) {
                        const objA = cell.objectContainer[k];
                        if (!objA.getAABB().active) continue;
                        for (let l = 0; l < adjacentCell.objectContainer.length; l++) {
                            const objB = adjacentCell.objectContainer[l];
                            if (!objB.getAABB().active) continue;
                            if (testAABBOverlap(objA, objB) === true) {
                                possibleCollisions.push([objA, objB]);
                            }
                        }
                    }
                }
            }

            for (let j = 0; j < grid.allObjects.length; j++) {
                const objA = grid.allObjects[j];
                const objAAABB = objA.getAABB();
                if (!objAAABB.active) continue;
                for (let k = i + 1; k < this._grids.length; k++) {
                    const biggerGrid = this._grids[k];
                    const objAHashInBiggerGrid = biggerGrid.toHash(objAAABB.min[0], objAAABB.min[1]);
                    const cell = biggerGrid.allCells[objAHashInBiggerGrid];

                    for (let c = 0; c < cell.neighborOffsetArray.length; c++) {
                        const offset = cell.neighborOffsetArray[c];

                        const adjacentCell = biggerGrid.allCells[cell.allCellsIndex! + offset];

                        for (let l = 0; l < adjacentCell.objectContainer.length; l++) {
                            const objB = adjacentCell.objectContainer[l];
                            if (!objB.getAABB().active) continue;
                            if (testAABBOverlap(objA, objB) === true) {
                                possibleCollisions.push([objA, objB]);
                            }
                        }
                    }
                }
            }
        }

        return possibleCollisions;
    }

    update_RECOMPUTE() {
        for (let i = 0; i < this._globalObjects.length; i++) {
            const obj = this._globalObjects[i];
            const meta = obj.HSHG!;
            const grid = meta!.grid!;

            const objAABB = obj.getAABB();
            const newObjHash = grid!.toHash(objAABB.min[0], objAABB.min[1]);

            if (newObjHash !== meta.hash) {
                grid.removeObject(obj);
                grid.addObject(obj, newObjHash);
            }
        }
    }

    update_REMOVEALL() {}
}

class Grid {
    public cellSize: number;
    public inverseCellSize: number;
    public rowColumnCount: number;
    public xyHashMask: number;
    public occupiedCells: Cell[] = [];
    public allCells: Cell[] = [];
    public allObjects: AABB[] = [];
    public sharedInnerOffsets: Offset = [];
    public _parentHierarchy: HSHG | null;

    constructor(cellSize: number, cellCount: number, parentHierarchy?: HSHG) {
        this.cellSize = cellSize;
        this.inverseCellSize = 1 / cellSize;
        this.rowColumnCount = ~~Math.sqrt(cellCount);
        this.xyHashMask = this.rowColumnCount - 1;
        this.occupiedCells = [];
        this.allCells = Array(this.rowColumnCount * this.rowColumnCount);
        this.allObjects = [];
        this.sharedInnerOffsets = [];

        this._parentHierarchy = parentHierarchy || null;
    }

    initCells() {
        const gridLength = this.allCells.length;

        const wh = this.rowColumnCount;
        let innerOffsets: Offset = [wh - 1, wh, wh + 1, -1, 0, 1, -1 + -wh, -wh, -wh + 1];
        let uniqueOffsets: Offset;

        this.sharedInnerOffsets = innerOffsets;

        for (let i = 0; i < gridLength; i++) {
            const cell = new Cell();
            const y = ~~(i / this.rowColumnCount);
            const x = ~~(i - y * this.rowColumnCount);

            let isOnRightEdge = false;
            let isOnLeftEdge = false;
            let isOnTopEdge = false;
            let isOnBottomEdge = false;

            if ((x + 1) % this.rowColumnCount == 0) {
                isOnRightEdge = true;
            } else if (x % this.rowColumnCount == 0) {
                isOnLeftEdge = true;
            }

            if ((y + 1) % this.rowColumnCount == 0) {
                isOnTopEdge = true;
            } else if (y % this.rowColumnCount == 0) {
                isOnBottomEdge = true;
            }

            if (isOnRightEdge || isOnLeftEdge || isOnTopEdge || isOnBottomEdge) {
                const rightOffset = isOnRightEdge === true ? -wh + 1 : 1;
                const leftOffset = isOnLeftEdge === true ? wh - 1 : -1;
                const topOffset = isOnTopEdge === true ? -gridLength + wh : wh;
                const bottomOffset = isOnBottomEdge === true ? gridLength - wh : -wh;

                uniqueOffsets = [
                    leftOffset + topOffset,
                    topOffset,
                    rightOffset + topOffset,
                    leftOffset,
                    0,
                    rightOffset,
                    leftOffset + bottomOffset,
                    bottomOffset,
                    rightOffset + bottomOffset,
                ];

                cell.neighborOffsetArray = uniqueOffsets;
            } else {
                cell.neighborOffsetArray = this.sharedInnerOffsets;
            }

            cell.allCellsIndex = i;
            this.allCells[i] = cell;
        }
    }

    toHash(x: number, y: number) {
        var i: number, xHash: number, yHash: number;

        if (x < 0) {
            i = -x * this.inverseCellSize;
            xHash = this.rowColumnCount - 1 - (~~i & this.xyHashMask);
        } else {
            i = x * this.inverseCellSize;
            xHash = ~~i & this.xyHashMask;
        }

        if (y < 0) {
            i = -y * this.inverseCellSize;
            yHash = this.rowColumnCount - 1 - (~~i & this.xyHashMask);
        } else {
            i = y * this.inverseCellSize;
            yHash = ~~i & this.xyHashMask;
        }

        return xHash + yHash * this.rowColumnCount;
    }

    addObject(obj: AABB, hash?: number) {
        let objHash: number, targetCell: Cell;

        if (hash !== undefined) {
            objHash = hash;
        } else {
            const objAABB = obj.getAABB();
            objHash = this.toHash(objAABB.min[0], objAABB.min[1]);
        }
        targetCell = this.allCells[objHash];

        if (targetCell.objectContainer.length === 0) {
            targetCell.occupiedCellsIndex = this.occupiedCells.length;
            this.occupiedCells.push(targetCell);
        }

        obj.HSHG!.objectContainerIndex = targetCell.objectContainer.length;
        obj.HSHG!.hash = objHash;
        obj.HSHG!.grid = this;
        obj.HSHG!.allGridObjectsIndex = this.allObjects.length;
        targetCell.objectContainer.push(obj);

        this.allObjects.push(obj);

        if (this.allObjects.length / this.allCells.length > MAX_OBJECT_CELL_DENSITY) {
            this.expandGrid();
        }
    }

    removeObject(obj: AABB) {
        const meta = obj.HSHG!;
        const hash = meta.hash!;
        const containerIndex = meta.objectContainerIndex;
        const allGridObjectsIndex = meta.allGridObjectsIndex;
        const cell = this.allCells[hash];

        if (cell.objectContainer.length === 1) {
            cell.objectContainer.length = 0;

            if (cell.occupiedCellsIndex === this.occupiedCells.length - 1) {
                this.occupiedCells.pop();
            } else {
                const replacementCell = this.occupiedCells.pop();
                replacementCell!.occupiedCellsIndex = cell.occupiedCellsIndex;
                this.occupiedCells[cell.occupiedCellsIndex!] = replacementCell!;
            }

            cell.occupiedCellsIndex = null;
        } else {
            if (containerIndex === cell.objectContainer.length - 1) {
                cell.objectContainer.pop();
            } else {
                const replacementObj = cell.objectContainer.pop()!;
                replacementObj.HSHG!.objectContainerIndex = containerIndex;
                cell.objectContainer[containerIndex!] = replacementObj;
            }
        }

        if (allGridObjectsIndex === this.allObjects.length - 1) {
            this.allObjects.pop();
        } else {
            const replacementObj = this.allObjects.pop()!;
            replacementObj.HSHG!.allGridObjectsIndex = allGridObjectsIndex;
            this.allObjects[allGridObjectsIndex!] = replacementObj;
        }
    }

    expandGrid() {
        const newRowColumnCount = ~~Math.sqrt(this.allCells.length * 4),
            newXYHashMask = newRowColumnCount - 1,
            allObjects = this.allObjects.slice(0);

        for (let i = 0; i < allObjects.length; i++) {
            this.removeObject(allObjects[i]);
        }

        this.rowColumnCount = newRowColumnCount;
        this.allCells = Array(this.rowColumnCount * this.rowColumnCount);
        this.xyHashMask = newXYHashMask;

        this.initCells();

        for (let i = 0; i < allObjects.length; i++) {
            this.addObject(allObjects[i]);
        }
    }
}

class Cell {
    public objectContainer: AABB[] = [];
    public neighborOffsetArray: Offset;
    public occupiedCellsIndex: number | null = null;
    public allCellsIndex: number | null = null;
}
