import {CollisionComponent, Component, PhysXComponent, property} from "@wonderlandengine/api";

export enum GrabSearchMode {
    Distance = 0,
    Overlap = 1
}

export enum GrabSnapMode {
    None = 0,
    GrabToInteractor = 1,
}

export class GrabPoint extends Component {
    static TypeName = 'grab-point';

    @property.enum(['None', 'GrabToInteractor'], GrabSnapMode.GrabToInteractor)
    snap: GrabSnapMode = GrabSnapMode.GrabToInteractor;

    @property.enum(['Distance', 'Overlap'], 0)
    searchMode: number = 0;

    @property.bool(false)
    multigrip: boolean = false;

    @property.float(0.2)
    maxDistance = 0.2;
}
