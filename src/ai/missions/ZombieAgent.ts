import {RaidAgent} from "./RaidAgent";

export class ZombieAgent extends RaidAgent {

    public memory: {
        reachedFallback: boolean;
        registered: boolean;
        safeCount: number;
        demolishing: boolean;
    };

}
