import {
    Component,
    ForceMode,
    InputComponent,
    InputType,
    LockAxis,
    Object3D,
    PhysXComponent,
    property,
    ViewComponent,
    WonderlandEngine,
} from '@wonderlandengine/api';
import {vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {
    DefaultPlayerControllerInput,
    PlayerControllerInput,
} from './player-controller-input.js';
import {toRad} from '../utils/math.js';
import {EPSILON, ZERO_VEC3} from '../constants.js';
import {componentError} from '../utils/wle.js';
import {TempVec3} from '../internal-constants.js';

/* Temporaries */
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
 * @see {@link PlayerControllerInput} for handling input from various input providers
 */
export class PlayerController extends Component {
    static TypeName = 'player-controller';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(ActiveCamera);
        engine.registerComponent(DefaultPlayerControllerInput);
    }

    /** Object  */
    @property.object()
    inputObject: Object3D | null = null;

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
    private _rotateState = RotateState.None;

    private _input!: PlayerControllerInput;

    private _movement = vec3.create();
    private _rotation = vec3.create();
    private _previousType: RotationType = null!;

    private _snapped = false;
    private _lowThreshold = 0.2;
    private _highThreshold = 0.5;

    start() {
        let maybeCamera = this.object.getComponent(ActiveCamera);
        let maybeInput = (this.inputObject ?? this.object).getComponent(
            DefaultPlayerControllerInput
        );

        let left: InputComponent | null = null;
        let right: InputComponent | null = null;
        let eyeLeft: InputComponent | null = null;
        let eyeRight: InputComponent | null = null;

        if (!maybeCamera || !maybeInput) {
            const inputs = this.scene.getComponents(InputComponent);
            for (const input of inputs) {
                switch (input.inputType) {
                    case InputType.ControllerLeft:
                        left = input;
                        break;
                    case InputType.ControllerRight:
                        right = input;
                        break;
                    case InputType.EyeLeft:
                        eyeLeft = input;
                        break;
                    case InputType.EyeRight:
                        eyeRight = input;
                        break;
                }
            }
        }

        if (!maybeCamera) {
            /* No ActiveCamera found, try our best to create one automatically */

            const views = this.scene.getComponents(ViewComponent);
            let mainView: ViewComponent | null = null;
            for (const view of views) {
                if (view.object.getComponent(InputComponent)) continue;
                mainView = view;
                break;
            }
            if (!eyeLeft) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and left eye couldn't be found"
                    )
                );
            }
            if (!eyeRight) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and right eye couldn't be found"
                    )
                );
            }
            if (!mainView) {
                throw new Error(
                    componentError(
                        this,
                        "'ActiveCamera' component not provided, and non VR view couldn't be found"
                    )
                );
            }
            maybeCamera = this.object.addComponent(ActiveCamera, {
                nonVrCamera: mainView.object,
                leftEye: eyeLeft.object,
                rightEye: eyeRight.object,
            });
        }
        this._activeCamera = maybeCamera;

        if (!maybeInput) {
            /* No input bridge found, try our best to create one automatically */

            if (!left) {
                throw new Error(
                    componentError(
                        this,
                        "'PlayerControllerInput' component not provided, and left controller couldn't be found"
                    )
                );
            }
            if (!right) {
                throw new Error(
                    componentError(
                        this,
                        "'PlayerControllerInput' component not provided, and right controller couldn't be found"
                    )
                );
            }
            maybeInput = this.object.addComponent(DefaultPlayerControllerInput, {
                leftControlObject: left.object,
                rightControlObject: right.object,
            });
        }
        this._input = maybeInput;
    }

    onActivate(): void {
        const physx = this.object.getComponent(PhysXComponent);
        if (!physx) {
            throw new Error(componentError(this, 'Missing required physx component'));
        }
        this._physx = physx;
    }

    update(dt: number): void {
        /* Rotation update */

        if (this._rotateState === RotateState.Reset) {
            this._physx.angularLockAxis = LockAxis.X | LockAxis.Y | LockAxis.Z;
            this._physx.kinematic = false;
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
        this._input.getRotationAxis(this._rotation);
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
        this._input.getMovementAxis(this._movement);
        vec3.scale(this._movement, this._movement, this.speed);

        if (!vec3.equals(this._movement, ZERO_VEC3)) {
            this.move(this._movement);
        }
    }

    /**
     * Moves the player in the given direction.
     * @param movement The direction to move in.
     */
    move(movement: vec3) {
        if (this._physx.kinematic) {
            /* Skip movement in snap mode during a rotation */
            return;
        }

        // Move according to headObject Forward Direction
        const currentCamera = this._activeCamera.current;
        currentCamera.getForwardWorld(this._headForward);

        const direction = TempVec3.get();
        vec3.transformQuat(direction, movement, currentCamera.getTransformWorld());
        direction[1] = 0;
        this._physx.addForce(direction);

        TempVec3.free(1);
    }

    /**
     * Rotates the player on the Y axis for the given amount of degrees.
     * Can be called every frame.
     */
    rotateSnap(angle: number) {
        if (!this._physx.kinematic) {
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
