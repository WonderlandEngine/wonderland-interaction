import {
    Component,
    ForceMode,
    InputComponent,
    LockAxis,
    Object3D,
    PhysXComponent,
    property,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {
    DefaultInputBridge,
    InputBridgeTypename,
    PlayerControllerInput,
} from './input-bridge.js';
import {toRad} from '../utils/math.js';
import {EPSILON} from '../constants.js';
import {componentError} from '../utils/wle.js';

/* Temporaries */
const tempCameraVec = vec3.create();
const tempPlayerVec = vec3.create();
const _vectorA = vec3.create();

/**
 * The type of rotation to use when turning the player
 */
export enum RotationType {
    None = 0,
    /**
     * Snap will rotate by a fix amount of degrees in a row.
     *
     * It's the most comfortable for most people.
     */
    Snap = 1,
    /**
     * Smooth rotation over multiple frame.
     *
     * Smooth rotation is the most immersive, but can cause motion sickness.
     */
    Smooth = 2,
}
/** List of string keys for {@link RotationType}. */
export const RotationTypeNames = ['None', 'Snap', 'Smooth'];

enum RotateState {
    None = 0,
    Reset = 1,
}

/**
 * This component is attached to the player object and is responsible for
 * controlling the player's movement and rotation.
 *
 * It needs to have a physx component attached to it. And be on the root of the
 * player hierarchy.
 *
 *
 * @see {@link InputBridge} for handling input from various input providers
 * @see {@link PlayerRotate} for rotating the player
 * @see {@link HeadCollissionMove} for pushing the player backwards when their head collides with a wall / object
 * @see {@link HeadCollissionFade} for fading to black when the player's head collides with a wall / object
 */
export class PlayerController extends Component {
    static TypeName = 'player-controller';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(DefaultInputBridge);
    }

    @property.object()
    inputBridgeObject: Object3D | null = null;

    /* Locomotion properties */

    @property.float(10)
    speed = 10;

    /* Rotation properties */

    @property.enum(RotationTypeNames, RotationType.Snap)
    rotationType = RotationType.Snap;

    /**
     * The number of degrees at which the player rotates when snap-rotating
     */
    @property.float(45)
    snapDegrees = 45;

    /**
     * The speed at which the player rotates when smooth-rotating
     */
    @property.float(1)
    rotationSpeed = 1;

    private _physx!: PhysXComponent;
    private _headForward: vec3 = [0, 0, 0];
    private _activeCamera!: ActiveCamera;
    private _isRotating = false;
    private _rotateState = RotateState.None;

    private _inputBridge!: PlayerControllerInput;

    private _movement = vec3.create();
    private _rotation = vec3.create();
    private _previousType: RotationType = null!;

    private _snapped = false;
    private _lowThreshold = 0.2;
    private _highThreshold = 0.5;

    start() {
        const tempActiveCamera = this.object.getComponent(ActiveCamera);
        if (!tempActiveCamera) {
            throw new Error(componentError(this, 'object does not have a ActiveCamera'));
        }
        this._activeCamera = tempActiveCamera;

        const maybeInput = (this.inputBridgeObject ?? this.object).getComponent(
            DefaultInputBridge
        );
        if (maybeInput) {
            this._inputBridge = maybeInput;
            return;
        }

        /* No input bridge found, try our best to create one automatically */

        const inputs = this.scene.getComponents(InputComponent);
        let left: InputComponent | null = null;
        let right: InputComponent | null = null;
        for (const input of inputs) {
            if (input.handedness === 'left') left = input;
            else if (input.handedness === 'right') right = input;
        }

        if (!left) {
            throw new Error(
                componentError(
                    this,
                    "PlayerControllerInput not provided, and couldn't find left input component"
                )
            );
        }
        if (!right) {
            throw new Error(
                componentError(
                    this,
                    "PlayerControllerInput not provided, and couldn't find right input component"
                )
            );
        }

        this._inputBridge = this.object.addComponent(DefaultInputBridge, {
            leftControlObject: left.object,
            rightControlObject: right.object,
        });
    }

    onActivate(): void {
        const physx = this.object.getComponent(PhysXComponent);
        if (!physx) {
            throw new Error(componentError(this, 'object does not have a Physx'));
        }
        this._physx = physx;
    }

    update(dt: number): void {
        /* Rotation update */

        if (this._rotateState === RotateState.Reset) {
            this._physx.angularLockAxis = LockAxis.X | LockAxis.Y | LockAxis.Z;
            this._physx.kinematic = false;
            this._isRotating = false;
            this._rotateState = RotateState.None;
        }

        if (this._previousType !== this.rotationType) {
            /** @todo: Remove at 1.2.0, when the runtime supports updating
             * lock axis in real time. */
            const lockY = this.rotationType === RotationType.Smooth ? 0 : LockAxis.Y;
            this._physx.angularLockAxis = LockAxis.X | lockY | LockAxis.Z;
            this._physx.active = false;
            this._physx.active = true;
            this._previousType = this.rotationType;
        }

        vec3.zero(this._rotation);
        this._inputBridge.getRotationAxis(this._rotation);
        switch (this.rotationType) {
            case RotationType.Snap:
                this._rotatePlayerSnap();
                break;
            case RotationType.Smooth:
                this._rotatePlayerSmooth(dt);
                break;
        }

        /* Position update */

        vec3.zero(this._movement);
        this._inputBridge.getMovementAxis(this._movement);
        vec3.scale(this._movement, this._movement, this.speed);

        const moving =
            this._movement[0] !== 0 || this._movement[1] !== 0 || this._movement[2] !== 0;
        if (moving) {
            this.move(this._movement);
        }
    }

    /**
     * Moves the player in the given direction.
     * @param movement The direction to move in.
     */
    move(movement: vec3) {
        if (this._isRotating || this._physx.kinematic) {
            // For now, don't move while rotating or when kinematic is on.
            // Because we use physics to move, we need to switch to kinematic mode
            // during rotation.
            return;
        }

        // Move according to headObject Forward Direction
        const currentCamera = this._activeCamera.current;
        currentCamera.getForwardWorld(this._headForward);

        // Combine direction with headObject
        vec3.transformQuat(movement, movement, currentCamera.getTransformWorld());

        // Do not move on Y axis
        movement[1] = 0;

        // Add force to Physx Component to move the player
        this._physx.addForce(movement);
    }

    /**
     * Rotates the player on the Y axis for the given amount of degrees.
     * Can be called every frame.
     */
    rotateSnap(angle: number) {
        if (!this._physx.kinematic) {
            this._isRotating = true;
            this._physx.kinematic = true;
            this._rotateState = RotateState.Reset;
        }
        const rot = vec3.set(_vectorA, 0, 1, 0);
        this.object.rotateAxisAngleDegObject(rot, -angle);
    }

    rotateSmooth(angle: number) {
        this._physx.angularLockAxis = LockAxis.X | LockAxis.Z;
        const rot = vec3.set(_vectorA, 0, -toRad(angle), 0);
        this._physx.addTorque(rot, ForceMode.VelocityChange);
        this._rotateState = RotateState.Reset;
    }

    private _rotatePlayerSnap() {
        const currentAxis = this._rotation[0];

        if (Math.abs(currentAxis) < this._lowThreshold) {
            this._snapped = false;
            return;
        }

        // need to release trigger before snapping again
        if (this._snapped || Math.abs(currentAxis) < this._highThreshold) {
            return;
        }
        this._snapped = true;
        let rotation = this.snapDegrees;
        if (currentAxis < 0) {
            rotation *= -1;
        }
        this.rotateSnap(rotation);
    }

    private _rotatePlayerSmooth(dt: number) {
        if (Math.abs(this._rotation[0]) < EPSILON) {
            return;
        }
        const radians = this._rotation[0] * this.rotationSpeed * dt * 100;
        this.rotateSmooth(radians);
    }
}
