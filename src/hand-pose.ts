/** Set of standard poses for the default  */

export enum HandAvatarDefinition {
    PinkyPhalanxDistal = 0, /* 'pinky-finger-phalanx-distal' */
    PinkyPhalanxIntermediate = 1, /* pinky-finger-phalanx-intermediate */
    PinkyPhalanxProximal = 2, /* pinky-finger-phalanx-proximal */

    Count = 1,
}

export const HandPoseStandardGrab: number[] = new Array(HandAvatarDefinition.Count);
HandPoseStandardGrab[HandAvatarDefinition.PinkyPhalanxDistal] = 0.0;
HandPoseStandardGrab[HandAvatarDefinition.PinkyPhalanxIntermediate] = 0.0;
HandPoseStandardGrab[HandAvatarDefinition.PinkyPhalanxProximal] = 0.5;
