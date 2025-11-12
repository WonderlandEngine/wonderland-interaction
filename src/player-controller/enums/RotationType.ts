/**
 * The type of rotation to use when turning the player
 */
export enum RotationType {
    /**
     * Snap will rotate by a fix amount of degrees in a row.
     *
     * It's the most comfortable for most people.
     */
    Snap = 0,

    /**
     * Smooth rotation over multiple frame.
     *
     * Smooth rotation is the most immersive, but can cause motion sickness.
     */
    Smooth = 1,
}
