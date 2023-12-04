import {Component, Object3D} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {typename} from '../../constants.js';
import {PlayerController} from './player-controller.js';
import {RotationType} from './enums/RotationType.js';
import {InputBridge} from './input-bridge.js';
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

    start(): void {
        const tempPlayerController = this.object.getComponent(PlayerController);
        if (!tempPlayerController) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a PlayerController. This is required.`
            );
        }
        this._playerController = tempPlayerController;

        const tempInputBridge =
            this.inputBridgeObject?.getComponent(InputBridge) ||
            this.object.getComponent(InputBridge);
        if (!tempInputBridge) {
            throw new Error(
                `player-controller(${this.object.name}): object does not have a InputBridge and the inputBridgeObject parameter is not defined. One of these is required.`
            );
        }
        this._inputBridge = tempInputBridge;
    }

    update(dt: number) {
        this.updateInputs();
        if (this.rotationType === RotationType.Snap) {
            this.rotatePlayerSnap();
        } else if (this.rotationType === RotationType.Smooth) {
            this.rotatePlayerSmooth(dt);
        }
    }

    private updateInputs() {
        vec3.zero(this._rotation);

        if (!this.allowRotation) {
            return;
        }

        vec3.copy(this._rotation, this._inputBridge.getRotationAxis());
    }

    private rotatePlayerSnap() {
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
        this._playerController.rotate(rotation);
    }

    private rotatePlayerSmooth(dt: number) {
        // TODO: Can't do smooth rotation without kinematic mode. This needs to be solved first.
        // if (!this.isRotating) {
        //     return;
        // }
        // let currentAxis = this.rotation[0];
        // currentAxis *= this.rotationSpeed * dt;
        // this.playerController.rotate(currentAxis);
    }
}
