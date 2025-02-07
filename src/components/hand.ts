import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {mat4, quat} from 'gl-matrix';
import {HandAvatarDefinition} from '../hand-pose.js';

/**
 * Base class for any interactable.
 *
 * Interactables are generic object that can react to interactors. As a developper,
 * you can attach multiple interactable components and listen for incoming events.
 *
 * An interactable isn't mapping one to one to a {@link Grabbable}. Grabbables
 * can point to one or more interactable used as "handles". This allows for
 * instance to double grab an object.
 */
export class HandAvatar extends Component {
    static TypeName = 'hand-avatar';

    /** Properties. */

    @property.bool(true)
    automatic!: boolean;

    @property.bool(true)
    reparent!: boolean;

    @property.object()
    public pinkyPhalanxProximal!: Object3D;
    @property.object()
    public pinkyPhalanxIntermediate!: Object3D;
    @property.object()
    public pinkyPhalanxDistal!: Object3D;

    /** Private Attributes. */

    private _rotations: quat[] = [];
    private _joints: (Object3D | null)[] = [];

    start(): void {
        if (this.automatic) {
            // TODO: Traverse the graph once and search.
            if (!this.pinkyPhalanxProximal) {
                this.pinkyPhalanxProximal = this.object.findByNameRecursive(
                    'pinky-finger-phalanx-proximal'
                )[0];
            }
            if (!this.pinkyPhalanxIntermediate) {
                this.pinkyPhalanxIntermediate = this.object.findByNameRecursive(
                    'pinky-finger-phalanx-intermediate'
                )[0];
            }
            if (!this.pinkyPhalanxDistal) {
                this.pinkyPhalanxDistal = this.object.findByNameRecursive(
                    'pinky-finger-phalanx-distal'
                )[0];
            }
        }

        this._rotations = new Array(HandAvatarDefinition.Count);
        for (let i = 0; i < this._rotations.length; ++i) {
            this._rotations[i] = quat.create();
        }

        this._joints = new Array(HandAvatarDefinition.Count);
        this._joints[HandAvatarDefinition.PinkyPhalanxProximal] = this.pinkyPhalanxProximal;
        this._joints[HandAvatarDefinition.PinkyPhalanxIntermediate] =
            this.pinkyPhalanxIntermediate;
        this._joints[HandAvatarDefinition.PinkyPhalanxDistal] = this.pinkyPhalanxDistal;

        if (this.reparent) {
            this._reparent();
        }

        for (let i = 0; i < this._joints.length; ++i) {
            const joint = this._joints[i];
            if (!joint) continue;
            joint.getRotationLocal(this._rotations[i]);
        }
    }

    setPose(pose: number[]) {
        for (let i = 0; i < pose.length; ++i) {
            const joint = this._joints[i];
            if (!joint) continue;

            const weight = pose[i];
            const original = this._rotations[i];
            const rot = quat.clone(original);
            const radians = (weight * Math.PI) / 2;
            quat.rotateX(rot, rot, -radians);
            // joint.setRotationLocal(rot);
        }
    }

    private _reparent() {
        this._reparentKeepTransform(
            this.pinkyPhalanxIntermediate,
            this.pinkyPhalanxProximal
        );
        this._reparentKeepTransform(this.pinkyPhalanxDistal, this.pinkyPhalanxIntermediate);
    }

    private _reparentKeepTransform(target: Object3D, parent: Object3D) {
        target.parent = parent;

        const transform = target.getTransformWorld();
        const newParentTransform = parent.getTransformWorld();
        const inv = mat4.create();
        mat4.invert(inv, newParentTransform);

        const matrix = mat4.create();
        mat4.multiply(matrix, inv, transform);

        target.setTransformLocal(matrix);
    }
}
