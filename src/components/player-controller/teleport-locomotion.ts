import {Component, Object3D} from '@wonderlandengine/api';
import {typename} from '../../constants.js';
import {PlayerController} from './player-controller.js';
import {property} from '@wonderlandengine/api/decorators.js';
import {InputBridge} from './input-bridge.js';
import {vec2, vec3} from 'gl-matrix';
import {ActiveCamera} from '../helpers/active-camera.js';
import {Handedness} from '../interactor.js';

export class TeleportLocomotion extends Component {
    static TypeName = typename('teleport-locomotion');

    @property.object({required: false})
    inputBridgeObject!: Object3D;

    @property.object({required: true})
    teleportIndicatorMeshObject!: Object3D;

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

    private playerController!: PlayerController;
    private inputBridge!: InputBridge;
    private activeCamera!: ActiveCamera;

    private hitSpot = vec3.create();
    private extraRotation = 0;
    private currentStickAxes = vec2.create();
    private isIndicating = false;
    private wasIndicating = false;
    private indicatorHidden = true;
    private prevThumbstickAxes = vec2.create();

    private tempVec1 = vec3.create();
    private tempVec2 = vec3.create();
    private tempVec3 = vec3.create();
    private currentIndicatorRotation = 0;

    start(): void {
        const tempPlayerController = this.object.getComponent(PlayerController);
        if (!tempPlayerController) {
            throw new Error(
                `teleport-locomotion(${this.object.name}): object does not have a PlayerController. This is required.`
            );
        }
        this.playerController = tempPlayerController;

        const tempInputBridge =
            this.inputBridgeObject?.getComponent(InputBridge) ||
            this.object.getComponent(InputBridge);
        if (!tempInputBridge) {
            throw new Error(
                `teleport-locomotion(${this.object.name}): object does not have a InputBridge and the inputBridgeObject parameter is not defined. One of these is required.`
            );
        }
        this.inputBridge = tempInputBridge;

        const tempActiveCamera = this.object.getComponent(ActiveCamera);
        if (!tempActiveCamera) {
            throw new Error(
                `teleport-locomotion(${this.object.name}): object does not have a ActiveCamera`
            );
        }
        this.activeCamera = tempActiveCamera;
    }

    update(): void {
        this.getTeleportButton();

        if (this.isIndicating) {
            this.getTarget();
        } else {
            if (this.wasIndicating) {
                this.teleportIndicatorMeshObject.active = false;
                this.doTeleport(this.hitSpot, this.currentIndicatorRotation);
            }
        }

        this.wasIndicating = this.isIndicating;
    }

    private getTeleportButton() {
        const axes = this.inputBridge.getMovementAxis();
        vec2.set(this.currentStickAxes, axes[0], axes[2]);
        const inputLength = Math.abs(axes[0]) + Math.abs(axes[2]);

        // TODO: add more 'keys' to initiate teleport
        if (
            !this.isIndicating &&
            this.prevThumbstickAxes[1] >= this.thumbstickActivationThreshhold &&
            this.currentStickAxes[1] < this.thumbstickActivationThreshhold
        ) {
            this.isIndicating = true;
        } else if (
            this.isIndicating &&
            inputLength < this.thumbstickDeactivationThreshhold
        ) {
            this.isIndicating = false;
            this.teleportIndicatorMeshObject.active = false;
        }
        vec2.copy(this.prevThumbstickAxes, this.currentStickAxes);
    }

    private getTarget() {
        if (this.isIndicating && this.teleportIndicatorMeshObject) {
            // get the current hand position, or use the camera position for non VR.
            if (!this.inputBridge.getControllerPosition(this.tempVec1, Handedness.Left)) {
                this.activeCamera.current.getPositionWorld(this.tempVec1);
            }

            if (!this.inputBridge.getControllerForward(this.tempVec2, Handedness.Left)) {
                this.activeCamera.current.getForwardWorld(this.tempVec2);
            }

            const rayHit = this.engine.physics!.rayCast(
                this.tempVec1,
                this.tempVec2,
                1 << this.floorGroup,
                this.maxDistance
            );

            if (rayHit.hitCount > 0) {
                this.indicatorHidden = false;

                this.extraRotation =
                    Math.PI +
                    Math.atan2(this.currentStickAxes[0], this.currentStickAxes[1]);

                this.currentIndicatorRotation =
                    this.getCamRotation() + (this.extraRotation - Math.PI);

                this.teleportIndicatorMeshObject.resetPositionRotation();
                this.teleportIndicatorMeshObject.rotateAxisAngleRadLocal(
                    [0, 1, 0],
                    this.currentIndicatorRotation
                );

                this.teleportIndicatorMeshObject.translateWorld(rayHit.locations[0]);
                this.teleportIndicatorMeshObject.translateWorld([
                    0.0,
                    this.indicatorYOffset,
                    0.0,
                ]);
                this.teleportIndicatorMeshObject.active = true;
                vec3.copy(this.hitSpot, rayHit.locations[0]);
            } else {
                if (!this.indicatorHidden) {
                    this.teleportIndicatorMeshObject.active = false;
                    this.indicatorHidden = true;
                }
            }
        }
    }

    private doTeleport(location: vec3, rotation: number) {
        this.playerController.setPositionRotation(location, rotation);
    }

    /* Get current camera Y rotation */
    private getCamRotation() {
        this.activeCamera.current.getForwardWorld(this.tempVec3);
        this.tempVec3[1] = 0;
        vec3.normalize(this.tempVec3, this.tempVec3);
        return Math.atan2(this.tempVec3[0], this.tempVec3[2]);
    }
}
