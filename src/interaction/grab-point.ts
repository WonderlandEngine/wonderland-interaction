import {Component, property} from '@wonderlandengine/api';
import {
    Interactor,
    InteractorVisualState,
    InteractorVisualStateNames,
} from './interactor.js';

/**
 * Describe how the {@link Interactor} interacts with a {@link GrabPoint}.
 */
export enum GrabSearchMode {
    /**
     * Interaction occurs if the distance with the grab point
     * is in range of {@link GrabPoint.maxDistance}.
     */
    Distance = 0,
    /**
     * Interaction occurs if the grab point collision or physx collider
     * overlaps with the interactor.
     */
    Overlap = 1,
}
/** List of string keys for {@link GrabSearchMode}. */
export const GrabSearchModeNames = ['Distance', 'Overlap'];

/**
 * Describe how the {@link Grabbable} behave once the interaction starts
 * with the {@link GrabPoint}.
 */
export enum GrabSnapMode {
    /**
     * Grabbable is grabbed at the point of interaction,
     * doesn't snap to the grab point.
     */
    None = 0,
    /**
     * Grabbable is snapped to the interactor, using the grab point
     * as position / rotation for anchoring.
     */
    PositionRotation = 1,
}
/** List of string keys for {@link GrabSnapMode}. */
export const GrabSnapModeNames = ['None', 'PositionRotation'];

/**
 * Link used to specify how / where a {@link Grabbable} is grabbed.
 */
export class GrabPoint extends Component {
    static TypeName = 'grab-point';

    /** Snap mode, defaults to {@link GrabSnapMode.PositionRotation} */
    @property.enum(GrabSnapModeNames, GrabSnapMode.PositionRotation)
    snap: GrabSnapMode = GrabSnapMode.PositionRotation;

    /**
     * Lerp value used during interaction.
     *
     * Smaller values make the grabbable more slowly snap to the interactor,
     * higher values make the snapping effect more instantaneous.
     *
     * @note This value is clamped in the range `[0, 1]`.
     *
     * Defaults to `0.75`.
     */
    @property.float(0.75)
    snapLerp: number = 0.75;

    /** Search mode, defaults to {@link GrabSearchMode.Distance} */
    @property.enum(GrabSearchModeNames, GrabSearchMode.Distance)
    searchMode: GrabSearchMode = GrabSearchMode.Distance;

    /**
     * Maximum distance at which interaction can occur.
     *
     * @note This is only used if {@link searchMode} is set to {@link GrabSearchMode.Distance}.
     */
    @property.float(0.2)
    maxDistance = 0.2;

    /** If `true`, handle can be transfered to another interactor. */
    @property.bool(false)
    transferable = false;

    /** Visual state to apply to the interactor once interaction occurs. */
    @property.enum(InteractorVisualStateNames, InteractorVisualState.None)
    interactorVisualState = InteractorVisualState.None;

    /** @hidden */
    _interactor: Interactor | null = null;

    /** Current interactor managing this instance. */
    get interactor() {
        return this._interactor;
    }
}
