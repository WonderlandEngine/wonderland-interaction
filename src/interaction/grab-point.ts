import {
    CollisionComponent,
    Component,
    PhysXComponent,
    property,
} from '@wonderlandengine/api';
import {quat} from 'gl-matrix';
import {InteractorVisualState, InteractorVisualStateNames} from './interactor.js';

export enum GrabSearchMode {
    Distance = 0,
    Overlap = 1,
}

export enum GrabSnapMode {
    None = 0,
    PositionRotation = 1,
}

export class GrabPoint extends Component {
    static TypeName = 'grab-point';

    @property.enum(['None', 'GrabToInteractor'], GrabSnapMode.PositionRotation)
    snap: GrabSnapMode = GrabSnapMode.PositionRotation;

    @property.float(0.75)
    snapLerp: number = 0.75;

    @property.enum(['Distance', 'Overlap'], 0)
    searchMode: number = 0;

    @property.bool(false)
    multigrip: boolean = false;

    @property.float(0.2)
    maxDistance = 0.2;

    @property.enum(InteractorVisualStateNames, InteractorVisualState.None)
    interactorVisualState = InteractorVisualState.None;
}
