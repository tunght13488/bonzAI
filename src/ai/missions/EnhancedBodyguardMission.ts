import {helper} from "../../helpers/helper";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {InvaderGuru} from "./InvaderGuru";
import {Mission} from "./Mission";

export class EnhancedBodyguardMission extends Mission {

    public squadAttackers: Agent[];
    public squadHealers: Agent[];

    public hostiles: Creep[];
    public hurtCreeps: Creep[];
    private invaderGuru: InvaderGuru;

    constructor(operation: Operation, invaderGuru: InvaderGuru, allowSpawn = true) {
        super(operation, "defense", allowSpawn);
        this.invaderGuru = invaderGuru;
    }

    public initMission() {
        if (!this.hasVision) return; // early
        this.hostiles = _.filter(this.room.hostiles, (hostile: Creep) => hostile.owner.username !== "Source Keeper");

        if (!this.spawnGroup.room.terminal) return;
        if (this.memory.allowUnboosted === undefined) {
            const store = this.spawnGroup.room.terminal.store;
            this.memory.allowUnboosted = store[RESOURCE_CATALYZED_UTRIUM_ACID] >= 1000
                && store[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE] >= 1000;
        }

        for (const id in this.memory.ticksToLive) {
            const creep = Game.getObjectById(id);
            if (creep) continue;
            const ticksToLive = this.memory.ticksToLive[id];
            if (ticksToLive > 10 && this.memory.allowUnboosted) {
                console.log("DEFENSE:", this.operation.name, "lost a leeroy, increasing potency");
                this.memory.potencyUp = true;
            }
            else if (this.memory.potencyUp) {
                console.log("DEFENSE:", this.operation.name, "leeroy died of old age, decreasing potency:");
                this.memory.potencyUp = false;
            }
            delete this.memory.ticksToLive[id];
        }
    }

    public squadAttackerBody = () => {
        if (this.memory.potencyUp) {
            return this.configBody({
                [ATTACK]: 10,
                [RANGED_ATTACK]: 2,
                [MOVE]: 12,
            });
        }
        else {
            return this.configBody({
                [ATTACK]: 20,
                [RANGED_ATTACK]: 5,
                [MOVE]: 25,
            });
        }
    };

    public squadHealerBody = () => {
        if (this.memory.potencyUp) {
            return this.configBody({
                [TOUGH]: 8,
                [MOVE]: 12,
                [HEAL]: 4,
            });
        }
        else {
            return this.configBody({
                [TOUGH]: 4,
                [MOVE]: 16,
                [HEAL]: 12,
            });
        }
    };

    public getMaxSquads = () => this.invaderGuru.invaderProbable || this.hasVision && this.hostiles.length > 0 ? 1 : 0;

    public roleCall() {
        let healerMemory;
        let attackerMemory;
        if (this.memory.potencyUp) {
            attackerMemory = {boosts: [RESOURCE_CATALYZED_UTRIUM_ACID], allowUnboosted: true};
            healerMemory = {boosts: [RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE], allowUnboosted: true};
        }

        this.squadAttackers = this.headCount("lee", this.squadAttackerBody, this.getMaxSquads,
            {prespawn: 50, memory: attackerMemory, skipMoveToRoom: true});
        this.squadHealers = this.headCount("roy", this.squadHealerBody, this.getMaxSquads,
            {prespawn: 50, memory: healerMemory, skipMoveToRoom: true});
    }

    public missionActions() {

        this.findPartnerships(this.squadAttackers, "attacker");
        this.findPartnerships(this.squadHealers, "healer");

        for (const attacker of this.squadAttackers) {
            this.squadActions(attacker);
        }

        for (const healer of this.squadHealers) {
            this.healerActions(healer);
        }
    }

    public finalizeMission() {
        if (!this.memory.ticksToLive) this.memory.ticksToLive = {};
        for (const creep of this.squadAttackers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }
        for (const creep of this.squadHealers) {
            this.memory.ticksToLive[creep.id] = creep.ticksToLive;
        }
    }

    public invalidateMissionCache() {
        this.memory.allowUnboosted = undefined;
    }

    private squadActions(attacker: Agent) {

        // find healer, flee if there isn't one
        const healer = this.getPartner(attacker, this.squadHealers);
        if (!healer) { attacker.memory.partner = undefined; }

        if (!healer || healer.spawning) {
            if (attacker.room.name !== this.spawnGroup.pos.roomName || attacker.pos.isNearExit(0)) {
                attacker.travelTo(this.spawnGroup);
            }
            else {
                attacker.idleOffRoad(this.spawnGroup);
            }
            return;
        }

        // missionRoom is safe
        if (!this.hostiles || this.hostiles.length === 0) {
            healer.memory.mindControl = false;
            attacker.idleNear(this.flag);
            return;
        }

        let attacking = false;
        let rangeAttacking = false;
        healer.memory.mindControl = true;
        let target = attacker.pos.findClosestByRange(_.filter(this.hostiles, (c: Creep) => c.partCount(HEAL) > 0)) as Creep;
        if (!target) {
            target = attacker.pos.findClosestByRange(this.hostiles) as Creep;
        }
        if (!target && attacker.memory.targetId) {
            target = Game.getObjectById(attacker.memory.targetId) as Creep;
            if (!target) attacker.memory.targetId = undefined;
        }
        if (healer.hits < healer.hitsMax * .5 || attacker.hits < attacker.hitsMax * .5) {
            this.memory.healUp = true;
        }
        if (this.memory.healUp === true) {
            Agent.squadTravel(healer, attacker, this.spawnGroup);
            if (healer.hits > healer.hitsMax * .8 && attacker.hits > attacker.hitsMax * .8) {
                this.memory.healUp = false;
            }
        }
        else if (target) {
            attacker.memory.targetId = target.id;

            const range = attacker.pos.getRangeTo(target);
            if (range === 1) {
                attacker.rangedMassAttack();
                attacking = attacker.attack(target) === OK;
            }
            else if (range <= 3) {
                rangeAttacking = attacker.rangedAttack(target) === OK;
            }

            if (attacker.room.name !== target.room.name) {
                Agent.squadTravel(attacker, healer, target);
            }
            else if (range > 3 || (range > 1 && !(Game.time - attacker.memory.fleeTick === 1))) {
                Agent.squadTravel(attacker, healer, target);
            }
            else if (range > 1) {
                const fleePath = PathFinder.search(target.pos, {pos: attacker.pos, range: 5}, {
                    flee: true,
                    maxRooms: 1,
                });
                // will only flee-bust  on consecutive ticks
                if (fleePath.incomplete || !fleePath.path[1] || !fleePath.path[1].isNearExit(0)) {
                    Agent.squadTravel(attacker, healer, target, {ignoreRoads: true});
                }
                else {
                    attacker.memory.fleeTick = Game.time;
                    Agent.squadTravel(attacker, healer, {pos: fleePath.path[1]}, {ignoreRoads: true});
                }
            }
            else {
                if (!target.pos.isNearExit(0)) {
                    // directly adjacent, move on to same position
                    Agent.squadTravel(attacker, healer, target, {range: 0});
                }
                else {
                    const direction = attacker.pos.getDirectionTo(target);
                    if (direction % 2 === 1) return; // not a diagonal position, already in best position;
                    const clockwisePosition = attacker.pos.getPositionAtDirection(helper.clampDirection(direction + 1));
                    if (!clockwisePosition.isNearExit(0)) {
                        Agent.squadTravel(attacker, healer, {pos: clockwisePosition});
                    }
                    else {
                        const counterClockwisePosition = attacker.pos.getPositionAtDirection(helper.clampDirection(direction - 1));
                        Agent.squadTravel(attacker, healer, {pos: counterClockwisePosition});
                    }
                }
            }
        }
        else {
            Agent.squadTravel(attacker, healer, this.flag);
        }

        const closest = attacker.pos.findClosestByRange(this.hostiles);
        if (closest) {
            const range = attacker.pos.getRangeTo(closest);
            if (!attacking && range === 1) {
                attacker.attack(closest);
                if (!rangeAttacking) {
                    rangeAttacking = true;
                    attacker.rangedMassAttack();
                }
            }
            if (!rangeAttacking && range <= 3) {
                attacker.rangedAttack(closest);
            }
        }
    }

    private healerActions(healer: Agent) {
        if (!this.hostiles || this.hostiles.length === 0) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            else {
                this.medicActions(healer);
            }
            return;
        }

        // hostiles in missionRoom
        const attacker = Game.creeps[healer.memory.partner];
        if (!attacker) {
            healer.memory.partner = undefined;
        }

        if (!attacker || attacker.spawning) {
            if (healer.hits < healer.hitsMax) {
                healer.heal(healer);
            }
            if (attacker && attacker.room.name === healer.room.name) {
                healer.idleOffRoad(this.spawnGroup);
            }
            else {
                healer.travelTo(this.spawnGroup);
            }
            return;
        }

        // attacker is partnered and spawned
        const range = healer.pos.getRangeTo(attacker);
        if (range <= 3) {
            if (attacker.hitsMax - attacker.hits > healer.hitsMax - healer.hits) {
                if (range > 1) {
                    healer.rangedHeal(attacker);
                }
                else {
                    healer.heal(attacker);
                }
            }
            else {
                healer.heal(healer);
            }
        }
        else if (healer.hits < healer.hitsMax) {
            healer.heal(healer);
        }
    }
}
