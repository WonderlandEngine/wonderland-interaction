import {vec3, vec4} from 'gl-matrix';

import {CollisionComponent, Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {typename} from '../constants.js';
import {radiusHierarchy} from '../utils/wle.js';
import {Grabbable} from './grabbable.js';
import {Interactable} from './interactable.js';
import {Interactor} from './interactor.js';

/** Different interaction type. */
enum InteractionType {
    None,
    Searching,
    Fetching,
}

/**
 * Find the closest grabbable enclosed by the given collision shape.
 *
 * @param target Origin position.
 * @param collision The collision to query from.
 * @returns The closest grabbable, or `null` if none is found.
 */
function search(target: Object3D, collision: CollisionComponent | null): Grabbable | null {
    if (!collision) return null;
    // @todo: Add delay to only check every few frames
    const overlaps = collision.queryOverlaps();
    let closestDistance = Number.MAX_VALUE;
    let closestGrabbable: Grabbable | null = null;

    const position = target.getPositionWorld(vec3.create());
    for (let i = 0; i < overlaps.length; ++i) {
        const grabbable = overlaps[i].object.getComponent(Grabbable);
        if (!grabbable) continue;
        const interactableWorld = grabbable.object.getPositionWorld(vec3.create());
        const dist = vec3.squaredDistance(position, interactableWorld);
        if (dist < closestDistance) {
            closestGrabbable = grabbable;
            closestDistance = dist;
        }
    }
    return closestGrabbable;
}

/**
 * Reset the marker mesh to a position outside of the view.
 *
 * @param marker The marker.
 */
function resetMarker(marker: Object3D | null | undefined) {
    // @todo: Find a better way to hide the mesh.
    marker?.setPositionWorld([-100, -100, -100]);
}

/**
 * Grabs from a given distance.
 *
 * This component must be used together with {@link Interactor}.
 *
 * In order for this component to work, you should:
 *     - Add a rough collision box on grabbable (not interactable)
 *     - Prefer to use a unique mask value for ray collision / grabbable.
 */
export class DistanceInteractor extends Component {
    /** @overload */
    static TypeName = typename('distance-interactor');

    /** Public Attributes. */

    /** Main interactor. If `null`, interactor must be a sibling. */
    @property.object()
    interactor: Object3D | null = null;

    /**
     * Object with the ray collision. If `null`, interactor must be a sibling.
     *
     * The shape of the collision is used as a ray to find grabbable.
     */
    @property.object()
    ray: Object3D | null = null;

    /** Index of the collision component on the {@link ray} object. */
    @property.int(0)
    rayCollision: number = 0;

    /** Distance grabbing speed. */
    @property.float(1.0)
    speed: number = 1.0;

    /** Main interactor. @hidden */
    private _interactor: Interactor = null!;
    /** Ray collision component. @hidden */
    private _ray: CollisionComponent = null!;
    /** Current interaction type. @hidden */
    private _interaction: InteractionType = InteractionType.Searching;
    /** Currently focused grabbable (fetching or looking at). @hidden */
    private _targetGrab: Grabbable | null = null;
    /** Currently fetching interactable. @hidden */
    private _targetInteract: Interactable | null = null;

    /** @hidden */
    private _onGripStart = () => {
        if (this._interaction !== InteractionType.Searching || !this._targetGrab) return;

        this._targetInteract = this._targetGrab.getInteractable(
            this._targetGrab.distanceHandle
        );
        this._interaction = InteractionType.Fetching;
        resetMarker(this._targetGrab.distanceMarker);
        this._targetGrab.disablePhysx();
    };

    /** @hidden */
    private _onGripEnd = () => {
        if (this._interaction == InteractionType.Fetching && this._targetGrab) {
            this._targetGrab.enablePhysx();
            this._targetGrab.distanceMarker?.setPositionWorld([-100, -100, -100]);
        }
        this._interaction = InteractionType.Searching;
    };

    /** @overload */
    onActivate(): void {
        const interactor = (this.interactor ?? this.object).getComponent(Interactor);
        if (!interactor) {
            throw new Error();
        }
        const ray = (this.ray ?? this.object).getComponent(
            CollisionComponent,
            this.rayCollision
        );
        if (!ray) {
            throw new Error();
        }
        this._ray = ray;
        this._interaction = InteractionType.Searching;
        this._interactor = interactor;
        this._interactor.onGripStart.add(this._onGripStart);
        this._interactor.onGripEnd.add(this._onGripEnd);
    }

    /** @overload */
    onDeactivate(): void {
        this._interactor.onGripStart.remove(this._onGripStart);
        this._interactor.onGripStart.remove(this._onGripEnd);
    }

    /** @overload */
    update(dt: number) {
        if (this._interaction === InteractionType.None) return;

        const interactorPos = this._interactor.object.getPositionWorld();

        if (this._interaction === InteractionType.Fetching) {
            const from = this._targetInteract!.object.getPositionWorld();

            const grabToInteractor = vec3.create();
            vec3.subtract(grabToInteractor, interactorPos, from);
            vec3.normalize(grabToInteractor, grabToInteractor);
            vec3.scale(grabToInteractor, grabToInteractor, this.speed * dt * 10.0); // `10` for base speed.
            this._targetGrab!.object.translateWorld(grabToInteractor);

            vec3.subtract(grabToInteractor, from, interactorPos);
            if (vec3.squaredLength(grabToInteractor) < 0.01) {
                this._interaction = InteractionType.None;
                const interactable = this._targetInteract!;
                this._targetGrab = null;
                this._targetInteract = null;
                this._interactor.startInteraction(interactable);
            }
            return;
        }

        const grabbable = search(this._interactor.object, this._ray);
        if (grabbable?.distanceMarker) {
            const scale = radiusHierarchy(vec4.create(), grabbable.object);
            grabbable.distanceMarker.setPositionWorld(grabbable.object.getPositionWorld());
            grabbable.distanceMarker.setScalingWorld([scale, scale, scale]);
        } else if (this._targetGrab && !grabbable) {
            resetMarker(this._targetGrab.distanceMarker);
        }
        this._targetGrab = grabbable;
    }
}
