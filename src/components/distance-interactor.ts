import {vec3, vec4} from 'gl-matrix';

import {CollisionComponent, Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';

import {typename} from '../constants.js';
import {radiusHierarchy} from '../utils/wle.js';
import {Grabbable} from './grabbable.js';
import {Interactable} from './interactable.js';
import {Interactor} from './interactor.js';

enum InteractionType {
    None,
    Searching,
    Fetching,
}

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

function distanceFetch(
    target: Object3D,
    from: Object3D,
    to: Object3D,
    speed: number
): boolean {
    const grabToInteractor = vec3.create();
    vec3.subtract(grabToInteractor, to.getPositionWorld(), from.getPositionWorld());

    vec3.normalize(grabToInteractor, grabToInteractor);
    vec3.scale(grabToInteractor, grabToInteractor, speed * 10.0); // `10` for base speed.
    target.translateWorld(grabToInteractor);

    vec3.subtract(grabToInteractor, from.getPositionWorld(), to.getPositionWorld());
    return vec3.squaredLength(grabToInteractor) < 0.01;
}

function resetMarker(target: Object3D | null | undefined) {
    target?.setPositionWorld([-100, -100, -100]);
}

/**
 * Hello, I am a grabber!
 */
export class DistanceInteractor extends Component {
    static TypeName = typename('distance-interactor');

    /**
     * Public Attributes.
     */

    @property.object()
    interactor: Object3D | null = null;

    @property.object()
    ray: Object3D | null = null;
    @property.int(0)
    rayCollision: number = 0;

    @property.float(1.0)
    speed: number = 1.0;

    private _interactor: Interactor = null!;
    private _ray: CollisionComponent = null!;
    private _interaction: InteractionType = InteractionType.Searching;

    private _targetGrab: Grabbable | null = null;
    private _targetInteract: Interactable | null = null;

    private _onGripStart = () => {
        if (this._interaction !== InteractionType.Searching || !this._targetGrab) return;

        this._targetInteract = this._targetGrab.getInteractable(
            this._targetGrab.distanceHandle
        );
        this._interaction = InteractionType.Fetching;
        resetMarker(this._targetGrab.distanceMarker);
        this._targetGrab.disablePhysx();
    };

    private _onGripEnd = () => {
        if (this._interaction == InteractionType.Fetching && this._targetGrab) {
            this._targetGrab.enablePhysx();
            this._targetGrab.distanceMarker?.setPositionWorld([-100, -100, -100]);
        }
        this._interaction = InteractionType.Searching;
    };

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

    onDeactivate(): void {
        this._interactor.onGripStart.remove(this._onGripStart);
        this._interactor.onGripStart.remove(this._onGripEnd);
    }

    update(dt: number) {
        if (this._interaction === InteractionType.None) return;

        if (this._interaction === InteractionType.Fetching) {
            if (
                distanceFetch(
                    this._targetGrab!.object,
                    this._targetInteract!.object,
                    this._interactor.object,
                    this.speed * dt
                )
            ) {
                this._interaction = InteractionType.None;
                this._interactor.startInteraction(this._targetInteract!);
                this._targetGrab = null;
                this._targetInteract = null;
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
