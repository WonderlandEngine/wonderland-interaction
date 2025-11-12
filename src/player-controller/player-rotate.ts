import {Component, LockAxis, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {EPSILON, typename} from '../constants.js';
import {PlayerController} from './player-controller.js';
import {RotationType} from './enums/RotationType.js';
import {InputBridge, InputBridgeTypename} from './input-bridge.js';
import {vec3} from 'gl-matrix';

export class PlayerRotate extends Component {
    static TypeName = typename('player-rotate');
    private static rotationTypeMapping = ['Snap', 'Smooth'];

    @property.enum(
        PlayerRotate.rotationTypeMapping,
        PlayerRotate.rotationTypeMapping[RotationType.Snap]
    )
    rotationType = RotationType.Snap;

    @property.bool(true)
    allowRotation = true;

    @property.object()
    inputBridgeObject?: Object3D;

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

    private _playerController!: PlayerController;
    private _inputBridge!: InputBridge;
    private _rotation = vec3.create();
    private _snapped = false;
    private _lowThreshold = 0.2;
    private _highThreshold = 0.5;
    private _previousType: RotationType = null!;

    start(): void {
        const tempPlayerController = this.object.getComponent(PlayerController);
        if (!tempPlayerController) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a PlayerController. This is required.`
            );
        }
        this._playerController = tempPlayerController;

        const tempInputBridge =
            this.inputBridgeObject?.getComponent(InputBridgeTypename) ||
            this.object.getComponent(InputBridgeTypename);
        if (!tempInputBridge) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a InputBridge and the inputBridgeObject parameter is not defined. One of these is required.`
            );
        }
        this._inputBridge = tempInputBridge as InputBridge;
    }

    update(dt: number) {
        vec3.zero(this._rotation);
        if (!this.allowRotation) {
            return;
        }
        this._inputBridge.getRotationAxis(this._rotation);

        if (this._previousType !== this.rotationType) {
            /** @todo: Remove at 1.2.0, when the runtime supports updating
             * lock axis in real time. */
            const lockY = this.rotationType === RotationType.Smooth ? 0 : LockAxis.Y;
            this._playerController.physx.angularLockAxis = LockAxis.X | lockY | LockAxis.Z;
            this._playerController.physx.active = false;
            this._playerController.physx.active = true;
            this._previousType = this.rotationType;
        }

        if (this.rotationType === RotationType.Snap) {
            this._rotatePlayerSnap();
        } else if (this.rotationType === RotationType.Smooth) {
            this._rotatePlayerSmooth(dt);
        }
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
        this._playerController.rotateSnap(rotation);
    }

    private _rotatePlayerSmooth(dt: number) {
        if (Math.abs(this._rotation[0]) < EPSILON) {
            return;
        }
        const radians = this._rotation[0] * this.rotationSpeed * dt * 100;
        this._playerController.rotateSmooth(radians);
    }
}
