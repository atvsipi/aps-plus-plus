#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

#define MAX_OBJECT_CELL_DENSITY 1.0 / 8.0
#define INITIAL_GRID_LENGTH 256
#define HIERARCHY_FACTOR 2
#define HIERARCHY_FACTOR_SQRT sqrt(2)

typedef struct Point {
    float x;
    float y;
} Point;

typedef struct AABB {
    bool active;
    Point min;
    Point max;
} AABB;

typedef struct Grid Grid;

typedef struct HSHGMeta {
    int globalObjectsIndex;
    int objectContainerIndex;
    int allGridObjectsIndex;
    Grid *grid;
    int hash;
} HSHGMeta;

typedef struct AABBWrapper {
    AABB aabb;
    HSHGMeta *meta;
} AABBWrapper;

typedef struct Cell {
    AABBWrapper **objectContainer;
    int objectCount;
    int *neighborOffsetArray;
    int occupiedCellsIndex;
    int allCellsIndex;
} Cell;

typedef struct Grid {
    float cellSize;
    float inverseCellSize;
    int rowColumnCount;
    int xyHashMask;
    Cell **occupiedCells;
    int occupiedCellCount;
    Cell **allCells;
    AABBWrapper **allObjects;
    int allObjectCount;
    int *sharedInnerOffsets;
} Grid;

typedef struct HSHG {
    Grid **grids;
    int gridCount;
    AABBWrapper **globalObjects;
    int globalObjectCount;
} HSHG;