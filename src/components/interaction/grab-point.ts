import {CollisionComponent, Component, PhysXComponent, property} from "@wonderlandengine/api";

export enum GrabSearchMode {
    Distance = 0,
    Overlap = 1
}

export class GrabPoint extends Component {
    static TypeName = 'grab-point';

    @property.bool(true)
    shouldSnap: boolean = true;

    @property.enum(['Distance', 'Overlap'], 0)
    searchMode: number = 0;

    @property.bool(false)
    multigrip: boolean = false;

    @property.float(0.2)
    maxDistance = 0.2;

    public physx: PhysXComponent | null = null;
    public collision: CollisionComponent | null = null;

    onActivate(): void {
        this.physx = this.object.getComponent('physx');
        this.collision = this.object.getComponent('collision');
    }
}
