// Hierarchical Spatial Hash Grid: HSHG
// https://gist.github.com/kirbysayshi/1760774

#![deny(clippy::all)]
 
#[macro_use]
extern crate napi_derive;

type Point = (f64, f64);

// Neighboring cell offsets
type Offset = Vec<isize>;

// Placeholder cell structure
#[derive(Clone)]
#[napi(constructor)]
pub struct Cell {
    pub object_container: Vec<AABB>,
    pub neighbor_offset_array: Offset,
    pub occupied_cells_index: Option<usize>,
    pub all_cells_index: usize,
}

#[napi]
impl Cell {
    #[napi]
    pub fn new() -> Self {
        Cell {
            object_container: Vec::new(),
            neighbor_offset_array: Vec::new(),
            occupied_cells_index: None,
            all_cells_index: 0,
        }
    }
}

#[derive(Clone)]
#[napi(constructor)]
pub struct Grid {
    pub cell_size: f64,
    pub inverse_cell_size: f64,
    pub row_column_count: usize,
    pub xy_hash_mask: usize,
    pub occupied_cells: Vec<Cell>,
    pub all_cells: Vec<Cell>,
    pub all_objects: Vec<AABB>,
    pub shared_inner_offsets: Vec<isize>
}

#[napi]
impl Grid {
    #[napi(constructor)]
    pub fn new(cell_size: f64, cell_count: usize) -> Self {
        let row_column_count = (cell_count as f64).sqrt() as usize;
        let xy_hash_mask = row_column_count - 1;
        let all_cells = vec![Cell::new(); row_column_count * row_column_count];
        let shared_inner_offsets: Vec<isize> = Vec::new(); // to be initialized later
        Grid {
            cell_size,
            inverse_cell_size: 1.0 / cell_size,
            row_column_count,
            xy_hash_mask,
            occupied_cells: Vec::new(),
            all_cells,
            all_objects: Vec::new(),
            shared_inner_offsets
        }
    }

    // Initialize cells and offsets
    #[napi]
    pub fn init_cells(&mut self) {
        let wh = self.row_column_count as isize;
        let inner_offsets: Vec<isize> = vec![wh - 1, wh, wh + 1, -1, 0, 1, -wh - 1, -wh, -wh + 1];
        self.shared_inner_offsets = inner_offsets.clone();

        for (i, cell) in self.all_cells.iter_mut().enumerate() {
            let y = i / self.row_column_count;
            let x = i % self.row_column_count;

            let is_on_right_edge = (x + 1) % self.row_column_count == 0;
            let is_on_left_edge = x % self.row_column_count == 0;
            let is_on_top_edge = (y + 1) % self.row_column_count == 0;
            let is_on_bottom_edge = y % self.row_column_count == 0;

            let mut unique_offsets = vec![];

            if is_on_right_edge || is_on_left_edge || is_on_top_edge || is_on_bottom_edge {
                let right_offset = if is_on_right_edge { -wh + 1 } else { 1 };
                let left_offset = if is_on_left_edge { wh - 1 } else { -1 };
                let top_offset = if is_on_top_edge { -self.all_cells.len() as isize + wh } else { wh };
                let bottom_offset = if is_on_bottom_edge { self.all_cells.len() as isize - wh } else { -wh };

                unique_offsets = vec![
                    left_offset + top_offset,
                    top_offset,
                    right_offset + top_offset,
                    left_offset,
                    0,
                    right_offset,
                    left_offset + bottom_offset,
                    bottom_offset,
                    right_offset + bottom_offset,
                ];
                cell.neighbor_offset_array = unique_offsets;
            } else {
                cell.neighbor_offset_array = self.shared_inner_offsets.clone();
            }
            cell.all_cells_index = i;
        }
    }

    // Hash function to locate object in the grid
    #[napi]
    pub fn to_hash(&self, x: f64, y: f64) -> usize {
        let x_hash = if x < 0.0 {
            let i = (-x * self.inverse_cell_size).floor() as usize;
            self.row_column_count - 1 - (i & self.xy_hash_mask)
        } else {
            let i = (x * self.inverse_cell_size).floor() as usize;
            i & self.xy_hash_mask
        };

        let y_hash = if y < 0.0 {
            let i = (-y * self.inverse_cell_size).floor() as usize;
            self.row_column_count - 1 - (i & self.xy_hash_mask)
        } else {
            let i = (y * self.inverse_cell_size).floor() as usize;
            i & self.xy_hash_mask
        };

        x_hash + y_hash * self.row_column_count
    }

    // Add an object to the grid
    #[napi]
    pub fn add_object(&mut self, mut obj: AABB, hash: Option<usize>) {
        let obj_hash = hash.unwrap_or_else(|| {
            let obj_aabb = obj.get_aabb();
            self.to_hash(obj_aabb.0 .0, obj_aabb.0 .1)
        });

        let target_cell = &mut self.all_cells[obj_hash];

        if target_cell.object_container.is_empty() {
            target_cell.occupied_cells_index = Some(self.occupied_cells.len());
            self.occupied_cells.push(target_cell.clone());
        }

        let obj_meta = obj.hshg.as_mut().unwrap();
        obj_meta.hash = obj_hash;
        obj_meta.grid = Some(self.clone());
        obj_meta.object_container_index = target_cell.object_container.len();
        obj_meta.all_grid_objects_index = self.all_objects.len();
        target_cell.object_container.push(obj.clone());

        self.all_objects.push(obj.clone());

        // Check for grid expansion
        if (self.all_objects.len() as f64) / (self.all_cells.len() as f64) > MAX_OBJECT_CELL_DENSITY {
            self.expand_grid();
        }
    }

    // Remove an object from the grid
    #[napi]
    pub fn remove_object(&mut self, obj: AABB) {
        let meta = obj.hshg.as_ref().unwrap();
        let hash = meta.hash;
        let container_index = meta.object_container_index;
        let all_grid_objects_index = meta.all_grid_objects_index;
        let cell = &mut self.all_cells[hash];

        // Remove from cell's object container
        if cell.object_container.len() == 1 {
            cell.object_container.clear();
            if let Some(idx) = cell.occupied_cells_index {
                if idx == self.occupied_cells.len() - 1 {
                    self.occupied_cells.pop();
                } else {
                    let replacement = self.occupied_cells.pop().unwrap();
                    self.occupied_cells[idx] = replacement;
                    replacement.occupied_cells_index = Some(idx);
                }
                cell.occupied_cells_index = None;
            }
        } else {
            if container_index == cell.object_container.len() - 1 {
                cell.object_container.pop();
            } else {
                let replacement = cell.object_container.pop().unwrap();
                replacement.hshg.as_mut().unwrap().object_container_index = container_index;
                cell.object_container[container_index] = replacement;
            }
        }

        // Remove from grid's all objects list
        if all_grid_objects_index == self.all_objects.len() - 1 {
            self.all_objects.pop();
        } else {
            let replacement = self.all_objects.pop().unwrap();
            replacement.hshg.as_mut().unwrap().all_grid_objects_index = all_grid_objects_index;
            self.all_objects[all_grid_objects_index] = replacement;
        }
    }

    // Expand the grid when object density exceeds a threshold
    #[napi]
    pub fn expand_grid(&mut self) {
        let new_row_column_count = (self.all_cells.len() * 4).sqrt() as usize;
        let new_xy_hash_mask = new_row_column_count - 1;

        // Copy and clear all objects
        let mut all_objects = self.all_objects.clone();
        self.all_objects.clear();

        // Resize the grid
        self.row_column_count = new_row_column_count;
        self.all_cells = vec![Cell::new(); self.row_column_count * self.row_column_count];
        self.xy_hash_mask = new_xy_hash_mask;
        self.init_cells();

        // Re-add all objects
        for obj in all_objects {
            self.add_object(obj, None);
        }
    }
}

#[derive(Clone)]
#[napi(object)]
pub struct Meta {
    pub grid: Option<Grid>,
    pub hash: usize,
}

#[derive(Clone)]
#[napi(constructor)]
pub struct AABB {
    pub active: bool,
    pub min: Point,
    pub max: Point,
    pub mut hshg: Option<Meta>, 
}

#[napi]
impl AABB {
    #[napi(constructor)]
    pub fn new(active: bool, min: Point, max: Point) -> Self {
        AABB {
            active,
            min,
            max,
            hshg: None, 
        }
    }

    #[napi]
    pub fn set(&mut self, active: bool, min: Point, max: Point) -> Self {
        self.active = active;
        self.min = min;
        self.max = max;
        self.clone()
    }

    #[napi]
    pub fn get_aabb(&self) -> (&Point, &Point, bool) {
        (&self.min, &self.max, self.active)
    }
}

#[derive(Clone)]
#[napi(constructor)]
pub struct HSHG {
    pub grids: Vec<Grid>,
    pub global_objects: Vec<AABB>,
}

fn get_longest_aabb_edge(aabb: (&Point, &Point, bool)) -> f64 {
    let (min, max, _) = aabb;
    f64::max((max.0 - min.0).abs(), (max.1 - min.1).abs())
}

#[napi]
impl HSHG {
    #[napi(constructor)]
    pub fn new() -> Self {
        HSHG {
            grids: Vec::new(),
            global_objects: Vec::new(),
        }
    }

    // Adding meta information when adding objects to the HSHG
    #[napi]
    pub fn add_object(&mut self, mut obj: AABB) {
        let obj_size = get_longest_aabb_edge(obj.get_aabb());

        if self.grids.is_empty() {
            let cell_size = obj_size * f64::sqrt(2.0);
            let mut new_grid = Grid::new(cell_size, 256);
            new_grid.init_cells();
            let hash = new_grid.to_hash(obj.min.0, obj.min.1);

            // Set meta for the object
            obj.hshg = Some(Meta {
                grid: Some(new_grid.clone()),
                hash,
            });

            new_grid.add_object(obj.clone(), None);
            self.grids.push(new_grid);
        } else {
            let mut x: f64 = 0.0;
            for grid in &mut self.grids {
                x /= 2.0;
                if obj_size < x {
                    let x = x / 2.0;
                    if obj_size < x {
                        while obj_size < x {
                            x /= 2.0;
                        }
                        let mut new_grid = Grid::new(x * 2.0, 256);
                        new_grid.init_cells();
                        let hash = new_grid.to_hash(obj.min.0, obj.min.1);

                        // Set meta for the object
                        obj.hshg = Some(Meta {
                            grid: Some(new_grid.clone()),
                            hash,
                        });

                        new_grid.add_object(obj.clone(), None);
                        self.grids.push(new_grid);
                    } else {
                        let hash = grid.to_hash(obj.min.0, obj.min.1);

                        // Set meta for the object
                        obj.hshg = Some(Meta {
                            grid: Some(grid.clone()),
                            hash,
                        });

                        grid.add_object(obj.clone(), None);
                    }
                    break;
                }
            }

            while obj_size >= x {
                x *= 2.0;
            }

            let mut new_grid = Grid::new(x, 256);
            new_grid.init_cells();
            let hash = new_grid.to_hash(obj.min.0, obj.min.1);

            // Set meta for the object
            obj.hshg = Some(Meta {
                grid: Some(new_grid.clone()),
                hash,
            });

            new_grid.add_object(obj.clone(), None);
            self.grids.push(new_grid);
        }

        self.global_objects.push(obj);
    }

    // Now properly using meta in the update function
    #[napi]
    pub fn update(&mut self) {
        for obj in &mut self.global_objects {
            if let Some(meta) = &obj.hshg {
                if let Some(grid) = &meta.grid {
                    let obj_aabb = obj.get_aabb();
                    let new_obj_hash = grid.to_hash(obj_aabb.0.0, obj_aabb.0.1);

                    if new_obj_hash != meta.hash {
                        grid.remove_object(obj.clone());
                        grid.add_object(obj.clone(), None);
                        // Update meta hash
                        obj.hshg.as_mut().unwrap().hash = new_obj_hash;
                    }
                }
            }
        }
    }
}

