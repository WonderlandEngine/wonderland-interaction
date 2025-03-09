import {Component, Object3D, Skin} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {quat2} from 'gl-matrix';
import {HandAvatar, IdlePose} from '../hand-pose.js';
import {Interactor, TrackingType} from './interactor.js';

const _transform = quat2.create();

export class HandAvatarComponent extends Component {
    static TypeName = 'hand-avatar';

    /** Properties. */

    @property.skin({required: true})
    skin!: Skin;

    @property.object()
    skinRoot!: Object3D | null;

    /** Private Attributes. */

    private _transforms: quat2[] = new Array();
    private _joints: Object3D[] = new Array();
    private _rootBoneTransform = quat2.create();

    private _defaultSkinRootTransform = quat2.create();

    private _transitionPose: quat2[] = [];
    private _transitionSpeed: number = 1.0;

    private readonly _onTrackingChange = (_: TrackingType, newType: TrackingType) => {
        if (!this.skinRoot) return;

        this.skinRoot.resetTransform();
        if (newType === TrackingType.Controller) {
            const transform = quat2.create();
            quat2.multiply(
                transform,
                this._defaultSkinRootTransform,
                this._rootBoneTransform
            );
            this.skinRoot.setTransformLocal(transform);
        }
    };

    init() {
        this._joints = new Array(HandAvatar.Count);
        const joindIds = this.skin.jointIds;
        for (let i = 0; i < joindIds.length; ++i) {
            const object3d = this.scene.wrap(joindIds[i]);
            const index = HandAvatar[object3d.name as any] as unknown as number;
            if (index === undefined) continue;
            this._joints[index] = object3d;
        }

        const rootBone = this._joints[HandAvatar.wrist];
        if (rootBone) {
            rootBone.getTransformLocal(this._rootBoneTransform);
        }

        if (this.skinRoot) {
            this.skinRoot.getTransformLocal(this._defaultSkinRootTransform);
        }
    }

    update(dt: number): void {
        const pose = this._transitionPose;
        for (let i = 0; i < pose.length; ++i) {
            const joint = this._joints[i];
            if (!joint) continue;
            joint.getTransformLocal(_transform);
            quat2.lerp(_transform, _transform, pose[i], this._transitionSpeed * dt);
            joint.setTransformLocal(_transform);
        }
    }

    onActivate(): void {
        /* Reset all rotations based on the wriste root bone */
        const invTransform = quat2.create();
        this._joints[HandAvatar.wrist].getTransformLocal(invTransform);
        quat2.invert(invTransform, invTransform);

        this.skinRoot?.setTransformLocal(invTransform);

        this._transforms = new Array(HandAvatar.Count);
        for (let i = 0; i < this._joints.length; ++i) {
            const joint = this._joints[i];
            if (!joint) continue;

            const transform = joint.getTransformLocal();
            this._transforms[i] = transform;
        }

        const interactor = this.object.getComponent(Interactor);
        interactor?.onTrackingChanged.add(this._onTrackingChange);

        this.setPose(IdlePose);
    }

    onDeactivate(): void {
        const interactor = this.object.getComponent(Interactor);
        interactor?.onTrackingChanged.remove(this._onTrackingChange);
    }

    setPose(pose: Float32Array[]) {
        this._transitionPose = pose;
        this._transitionSpeed = 1.0;
        for (let i = 0; i < pose.length; ++i) {
            const joint = this._joints[i];
            if (joint) {
                joint.setTransformLocal(pose[i]);
            }
        }
    }

    transition(pose: Float32Array[], weight = 1.0, speed = 1.0) {
        this._transitionSpeed = speed;

        this._transitionPose = new Array(pose.length);
        for (let i = 0; i < pose.length; ++i) {
            const joint = this._joints[i];
            const transform = quat2.create();
            if (joint) {
                joint.getTransformLocal(transform);
                quat2.lerp(transform, transform, pose[i], weight);
            } else {
                quat2.copy(transform, pose[i]);
            }
            this._transitionPose[i] = transform;
        }
    }

    get joints() {
        return this._joints;
    }
}
