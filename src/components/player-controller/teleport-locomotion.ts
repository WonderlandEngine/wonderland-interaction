import {Component, Object3D} from '@wonderlandengine/api';
import {typename} from '../../constants.js';
import {PlayerController, getRequiredComponents} from './player-controller.js';
import {property} from '@wonderlandengine/api/decorators.js';
import {InputBridge} from './input-bridge.js';
import {quat, vec2, vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {Handedness} from '../interactor.js';
import {setComponentsActive} from '../../utils/activate-children.js';

/* Temporaries. */
const _axis = vec3.create();

export class TeleportLocomotion extends Component {
    static TypeName = typename('teleport-locomotion');

    @property.object({required: false})
    inputBridgeObject!: Object3D;

    @property.object({required: true})
    teleportIndicatorMeshObject!: Object3D;

    /**
     * If `true`, the player will be teleported to the center of the target location.
     * If `false`, the player will be teleported to the location of the controller on an area.
     */
    @property.bool(false)
    teleportToTarget = false;

    /**
     *  if `true`, the player can rotate the indicator with the controller.
     *  if `false`, the rotation of the target is used
     */
    @property.bool(true)
    indicatorRotation = true;

    @property.int(1)
    floorGroup = 1;

    /**
     * The threshold for activating the teleport indicator.
     * @default -0.7 (70% forward on the thumbstick)
     */
    @property.float(-0.7)
    thumbstickActivationThreshhold = -0.7;

    @property.float(0.3)
    thumbstickDeactivationThreshhold = 0.3;

    @property.float(0.01)
    indicatorYOffset = 0.01;

    @property.float(100.0)
    maxDistance = 100.0;

    private _playerController!: PlayerController;
    private _inputBridge!: InputBridge;
    private _activeCamera!: ActiveCamera;

    private _hitSpot = vec3.create();
    private _extraRotation = 0;
    private _currentStickAxes = vec2.create();
    private _isIndicating = false;
    private _wasIndicating = false;
    private _indicatorHidden = true;
    private _prevThumbstickAxes = vec2.create();
    private _hasHit = false;
    private _tempVec1 = vec3.create();
    private _tempVec2 = vec3.create();
    private _tempVec3 = vec3.create();
    private _tempQuat1 = quat.create();

    private currentIndicatorRotation = 0;

    start(): void {
        const {inputBridge, player} = getRequiredComponents(
            this.object,
            this.inputBridgeObject
        );
        this._inputBridge = inputBridge;
        this._playerController = player;

        const tempActiveCamera = this.object.getComponent(ActiveCamera);
        if (!tempActiveCamera) {
            throw new Error(
                `teleport-locomotion(${this.object.name}): object does not have a ActiveCamera`
            );
        }
        this._activeCamera = tempActiveCamera;

        this.teleportIndicatorMeshObject.active = false;
        setComponentsActive(this.teleportIndicatorMeshObject, false);
    }

    update(): void {
        this.getTeleportButton();

        if (this._isIndicating) {
            this.getTarget();
        } else {
            if (this._wasIndicating) {
                this.teleportIndicatorMeshObject.active = false;
                setComponentsActive(this.teleportIndicatorMeshObject, false);
                if (this._hasHit) {
                    this.doTeleport(this._hitSpot, this.currentIndicatorRotation);
                }
            }
        }

        this._wasIndicating = this._isIndicating;
    }

    private getTeleportButton() {
        const axes = this._inputBridge.getMovementAxis(_axis);
        vec2.set(this._currentStickAxes, axes[0], axes[2]);

        // @todo: Doesn't represent the real magnitude. Would be better
        // to use an euclidian distance instead.
        const inputLength = Math.abs(axes[0]) + Math.abs(axes[2]);

        // TODO: add more 'keys' to initiate teleport
        if (
            !this._isIndicating &&
            this._prevThumbstickAxes[1] >= this.thumbstickActivationThreshhold &&
            this._currentStickAxes[1] < this.thumbstickActivationThreshhold
        ) {
            this._isIndicating = true;
        } else if (
            this._isIndicating &&
            inputLength < this.thumbstickDeactivationThreshhold
        ) {
            this._isIndicating = false;
            this.teleportIndicatorMeshObject.active = false;
        }
        vec2.copy(this._prevThumbstickAxes, this._currentStickAxes);
    }

    private getTarget() {
        if (!this._isIndicating || !this.teleportIndicatorMeshObject) {
            return;
        }

        // get the current hand position, or use the camera position for non VR.
        if (!this._inputBridge.getControllerPosition(this._tempVec1, Handedness.Left)) {
            this._activeCamera.current.getPositionWorld(this._tempVec1);
        }

        if (!this._inputBridge.getControllerForward(this._tempVec2, Handedness.Left)) {
            this._activeCamera.current.getForwardWorld(this._tempVec2);
        }

        const rayHit = this.engine.physics!.rayCast(
            this._tempVec1,
            this._tempVec2,
            1 << this.floorGroup,
            this.maxDistance
        );

        if (rayHit.hitCount > 0) {
            this._indicatorHidden = false;

            if (this.indicatorRotation) {
                this._extraRotation =
                    Math.PI +
                    Math.atan2(this._currentStickAxes[0], this._currentStickAxes[1]);

                this.currentIndicatorRotation =
                    this.getCamRotation() + (this._extraRotation - Math.PI);
            } else {
                rayHit.objects[0]?.getRotationWorld(this._tempQuat1);
                // rotatin in degrees
                quat.getAxisAngle(this._tempVec3, this._tempQuat1);
                this.currentIndicatorRotation = this._tempVec3[1];
            }

            this.teleportIndicatorMeshObject.resetPositionRotation();
            this.teleportIndicatorMeshObject.rotateAxisAngleRadLocal(
                [0, 1, 0],
                this.currentIndicatorRotation
            );

            if (this.teleportToTarget) {
                rayHit.objects[0]?.getPositionWorld(this._hitSpot);
            } else {
                vec3.copy(this._hitSpot, rayHit.locations[0]);
            }

            this.teleportIndicatorMeshObject.translateWorld(this._hitSpot);
            this.teleportIndicatorMeshObject.translateWorld([
                0.0,
                this.indicatorYOffset,
                0.0,
            ]);
            setComponentsActive(this.teleportIndicatorMeshObject, true);
            this.teleportIndicatorMeshObject.active = true;
            this._hasHit = true;
        } else {
            if (!this._indicatorHidden) {
                this.teleportIndicatorMeshObject.active = false;
                setComponentsActive(this.teleportIndicatorMeshObject, false);
                this._indicatorHidden = true;
                this._hasHit = false;
            }
        }
    }

    private doTeleport(location: vec3, rotation: number) {
        this._playerController.setPositionRotation(location, rotation);
    }

    /* Get current camera Y rotation */
    private getCamRotation() {
        this._activeCamera.current.getForwardWorld(this._tempVec3);
        this._tempVec3[1] = 0;
        vec3.normalize(this._tempVec3, this._tempVec3);
        return Math.atan2(this._tempVec3[0], this._tempVec3[2]);
    }
}
