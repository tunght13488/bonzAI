import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {InvaderGuru} from "./InvaderGuru";
import {Mission} from "./Mission";

export class BodyguardMission extends Mission {

    public defenders: Agent[];
    public hostiles: Creep[];

    public memory: {};

    public getBody = () => {
        const unit = this.configBody({
            tough: 1,
            move: 5,
            attack: 3,
            heal: 1,
        });
        const potency = Math.min(this.spawnGroup.maxUnits(unit, 1), 3);
        return this.configBody({
            tough: potency,
            move: potency * 5,
            attack: potency * 3,
            heal: potency,
        });
    };

    public maxDefenders = () => {
        let maxDefenders = 0;
        if (this.invaderGuru && this.invaderGuru.invaderProbable) {
            maxDefenders = 1;
        }
        if (this.hasVision) {
            if (this.hostiles.length > 0) {
                maxDefenders = Math.ceil(this.hostiles.length / 2);
            }
            if (this.operation.type !== "mining" && this.room.findStructures(STRUCTURE_TOWER).length === 0) {
                maxDefenders = 1;
            }
        }
        return maxDefenders;
    };

    private invaderGuru: InvaderGuru;

    /**
     * Remote defense for non-owned rooms. If boosted invaders are likely, use EnhancedBodyguardMission
     * @param operation
     * @param invaderGuru
     * @param allowSpawn
     */

    constructor(operation: Operation, invaderGuru?: InvaderGuru, allowSpawn = true) {
        super(operation, "bodyguard", allowSpawn);
        this.invaderGuru = invaderGuru;
    }

    public initMission() {
        if (!this.hasVision) return; // early
        this.hostiles = this.room.hostiles;
    }

    public roleCall() {

        this.defenders = this.headCount("leeroy", this.getBody, this.maxDefenders, {prespawn: 50});
    }

    public missionActions() {

        for (const defender of this.defenders) {
            this.defenderActions(defender);
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    private defenderActions(defender: Agent) {
        if (!this.hasVision || this.hostiles.length === 0) {
            if (defender.hits < defender.hitsMax) {
                defender.heal(defender);
            }
            else {
                this.medicActions(defender);
            }
            return; // early
        }

        let attacking = false;
        const closest: Structure | Creep = defender.pos.findClosestByRange(this.hostiles);
        if (closest) {
            const range = defender.pos.getRangeTo(closest);
            if (range > 1) {
                defender.travelTo(closest);
            }
            else {
                attacking = defender.attack(closest) === OK;
                defender.move(defender.pos.getDirectionTo(closest));
            }
        }
        else {
            defender.travelTo(this.hostiles[0]);
        }

        if (!attacking && defender.hits < defender.hitsMax) {
            defender.heal(defender);
        }
    }
}
