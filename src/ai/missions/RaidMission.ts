import {empire} from "../../helpers/loopHelper";
import {BoostLevel, RaidData} from "../../interfaces";
import {Operation} from "../operations/Operation";
import {SpawnGroup} from "../SpawnGroup";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

export abstract class RaidMission extends Mission {

    public attacker: Agent;
    public healer: Agent;

    public raidData: RaidData;

    public specialistPart: string;
    public specialistBoost: string;
    public spawnCost: number;

    public raidWaypoints: Flag[];

    public spawned: boolean;
    public boostLevel: number;

    public healerBoosts: string[];
    public attackerBoosts: string[];

    public killCreeps: boolean;

    public attackRange: number;
    public attacksCreeps: boolean;

    public memory: {
        healerLead: boolean;
        spawned: boolean;
        spawn: { [roleName: string]: string }
        chessMode: boolean;
        killCreeps: boolean;
        targetId: string;
    };

    public abstract clearActions(attackingCreep: boolean);

    constructor(operation: Operation, name: string, raidData: RaidData, spawnGroup: SpawnGroup, boostLevel: number, allowSpawn: boolean) {
        super(operation, name, allowSpawn);
        this.raidData = raidData;
        this.spawnGroup = spawnGroup;
        this.boostLevel = boostLevel;
    }

    public initMission() {
        this.raidWaypoints = this.getFlagSet("_waypoints_", 15);
        this.raidWaypoints.push(this.raidData.fallbackFlag);
        if (this.boostLevel === BoostLevel.Training || this.boostLevel === BoostLevel.Unboosted) {
            this.healerBoosts = [];
            this.attackerBoosts = [];
        }
        else {
            this.healerBoosts = [
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE,
                RESOURCE_CATALYZED_GHODIUM_ALKALIDE,
                RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE];
        }

        // if (this.raidData.breachFlags[0].missionRoom && !this.memory.fallback && this.raidData.breachFlags[0].missionRoom.controller.safeMode.)
    }

    public roleCall() {
        const max = () => !this.memory.spawned ? 1 : 0;
        const reservation = {spawns: 2, currentEnergy: undefined};
        if (this.spawnGroup.maxSpawnEnergy >= this.spawnCost) {
            reservation.currentEnergy = this.spawnCost;
        }

        this.attacker = _.head(this.headCount(this.name + "Attacker", this.attackerBody, max, {
            memory: {boosts: this.attackerBoosts},
            reservation,
        }));

        if (this.attacker) {
            this.raidData.raidAgents.push(this.attacker);
            this.raidData.obstacles.push(this.attacker);
        }

        this.healer = _.head(this.headCount(this.name + "Healer", this.healerBody, max, {
            memory: {boosts: this.healerBoosts},
        }));

        if (this.healer) {
            this.raidData.raidAgents.push(this.healer);
        }
    }

    public missionActions() {

        /* ------PREPARE PHASE------ */

        // prep, wait for the other to boost
        const prepared = this.preparePhase();
        if (!prepared) return;

        // healing and attacking will be active from this point on
        this.healCreeps();
        const attackingCreep = this.attackCreeps();

        // creeps report about situation
        this.raidTalk();

        if (this.killCreeps || this.memory.targetId) {
            const foundHostiles = this.focusCreeps();
            if (foundHostiles) return;
        }

        /* ------TRAVEL PHASE------ */
        const waypointsTraveled = this.waypointSquadTravel(this.healer, this.attacker, this.raidWaypoints);
        if (!waypointsTraveled) return;

        /* --------FALLBACK-------- */
        if (this.raidData.fallback) {
            Agent.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
            return;
        }

        /* -------ENTRY PHASE------ */
        if (this.healer.room !== this.raidData.attackRoom || this.healer.pos.isNearExit(0)) {
            Agent.squadTravel(this.healer, this.attacker, this.raidData.breachFlags[0]);
            return;
        }
        if (this.attacker.room !== this.raidData.attackRoom || this.attacker.pos.isNearExit(0)) {
            Agent.squadTravel(this.attacker, this.healer, this.raidData.breachFlags[0]);
            return;
        }

        /* ------CLEAR PHASE------ */
        if (this.raidData.targetStructures && this.raidData.targetStructures.length > 0) {
            if (!this.healer.memory.clearPhase) {
                this.healer.memory.clearPhase = true;
                console.log(`RAID: breach cleared! (${this.operation.name} ${this.name})`);
            }
            this.clearActions(attackingCreep);
            return;
        }

        if (!this.healer.memory.finishPhase) {
            this.healer.memory.finishPhase = true;
            console.log(`RAID: all structures cleared! (${this.operation.name} ${this.name})`);
        }

        /* ------FINISH PHASE------ */
        this.finishActions(attackingCreep);
    }

    public finalizeMission() {
        if (!this.memory.spawned && this.memory.spawn[this.name + "Attacker"].length > 0
            && this.memory.spawn[this.name + "Healer"].length > 0) {
            this.memory.spawned = true;
        }
        if (this.memory.spawned && this.memory.spawn[this.name + "Attacker"].length === 0
            && this.memory.spawn[this.name + "Healer"].length === 0) {
            this.memory.spawned = false;
        }
        this.spawned = this.memory.spawned;

        if (Game.time % 10 === 0 && !this.spawned && this.allowSpawn) {
            console.log(`RAID: ${this.operation.name} ${this.name} squad ready (reservation)`);
        }

        if (this.attacker && this.attacker.room.name !== this.raidData.breachFlags[0].pos.roomName) {
            this.attacker.memory.flagReached = false;
        }

        if (this.healer && this.healer.room.name !== this.raidData.breachFlags[0].pos.roomName) {
            this.healer.memory.flagReached = false;
        }
    }

    public invalidateMissionCache() {
    }

    protected standardClearActions(attackingCreep) {

        let target;
        if (this.raidData.breachStructures.length > 0) {
            target = this.findMissionTarget(this.raidData.breachStructures);
        }
        else if (this.raidData.targetStructures.length > 0) {
            target = this.findMissionTarget(this.raidData.targetStructures);
        }
        else {
            target = this.findMissionTarget(this.room.hostiles);
        }

        if (this.attacker.pos.inRangeTo(target, this.attackRange)) {
            this.attacker.dismantle(target);
            if (!attackingCreep) {
                this.attacker.rangedMassAttack();
                this.attacker.attack(target);
                if (target.pos.lookFor(LOOK_TERRAIN)[0] !== "swamp") {
                    Agent.squadTravel(this.attacker, this.healer, target);
                }
            }
            if (!this.healer.pos.isNearTo(this.attacker)) {
                this.healer.travelTo(this.attacker);
            }
        }
        else {
            Agent.squadTravel(this.attacker, this.healer, target, {range: this.attackRange});
        }
    }

    protected finishActions(attackingCreep: boolean) {
        Agent.squadTravel(this.healer, this.attacker, this.raidData.fallbackFlag);
    }

    private waypointSquadTravel(healer: Agent, attacker: Agent, waypoints: Flag[]): boolean {

        if (healer.memory.waypointsCovered) {
            return true;
        }

        if (healer.memory.waypointIndex === undefined) {
            healer.memory.waypointIndex = 0;
        }

        if (healer.memory.waypointIndex >= waypoints.length) {
            healer.memory.waypointsCovered = true;
            return true;
        }

        let leader = attacker;
        let follower = healer;
        if (this.memory.healerLead) {
            leader = healer;
            follower = attacker;
        }

        const waypoint = waypoints[healer.memory.waypointIndex];
        if (waypoint.room && leader.pos.inRangeTo(waypoint, 1)) {
            console.log(`RAID: waypoint ${healer.memory.waypointIndex} reached (${this.operation.name} ${this.name})`);
            healer.memory.waypointIndex++;
        }

        // travel through portal with follower
        if (leader.pos.lookForStructure(STRUCTURE_PORTAL)) {
            leader.travelTo(waypoint);
            follower.travelTo(waypoints[healer.memory.waypointIndex - 1]);
            return false;
        }

        Agent.squadTravel(leader, follower, waypoint);
    }

    protected squadFlee(roomObject: RoomObject) {
        if (this.attacker.fatigue > 0) return ERR_BUSY;

        if (this.attacker.pos.isNearTo(this.healer)) {
            if (this.attacker.pos.inRangeTo(roomObject, 2)) {
                this.healer.retreat([roomObject]);
                this.attacker.move(this.attacker.pos.getDirectionTo(this.healer));
            }
        }
        else {
            this.attacker.travelTo(this.healer, {ignoreCreeps: false});
        }
    }

    public healerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({[TOUGH]: 1, [MOVE]: 2, [HEAL]: 1});
        }
        else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({[TOUGH]: 5, [MOVE]: 25, [HEAL]: 20});
        }
        else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({[TOUGH]: 12, [MOVE]: 10, [HEAL]: 28});
        }
        else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({[TOUGH]: 12, [MOVE]: 8, [HEAL]: 20});
        }
        else {
            return this.configBody({[TOUGH]: 12, [MOVE]: 10, [HEAL]: 28});
        }
    };

    public attackerBody = (): string[] => {
        if (this.boostLevel === BoostLevel.Training) {
            return this.configBody({[TOUGH]: 1, [MOVE]: 3, [this.specialistPart]: 1, [RANGED_ATTACK]: 1});
        }
        else if (this.boostLevel === BoostLevel.Unboosted) {
            return this.configBody({[TOUGH]: 5, [MOVE]: 25, [this.specialistPart]: 19, [RANGED_ATTACK]: 1});
        }
        else if (this.boostLevel === BoostLevel.SuperTough) {
            return this.configBody({[TOUGH]: 24, [MOVE]: 10, [this.specialistPart]: 15, [RANGED_ATTACK]: 1});
        }
        else if (this.boostLevel === BoostLevel.RCL7) {
            return this.configBody({[TOUGH]: 12, [MOVE]: 8, [this.specialistPart]: 19, [RANGED_ATTACK]: 1});
        }
        else {
            return this.configBody({[TOUGH]: 12, [MOVE]: 10, [this.specialistPart]: 27, [RANGED_ATTACK]: 1});
        }
    };

    private healCreeps() {
        if (!this.healer) return;

        if (!this.raidData.injuredCreeps) {
            this.raidData.injuredCreeps = {};
            for (const creep of this.raidData.raidAgents) {
                if (creep.hits === creep.hitsMax) continue;
                this.raidData.injuredCreeps[creep.name] = creep.hits;
            }
        }

        const injuredCreeps = _.map(Object.keys(this.raidData.injuredCreeps), (name: string) => Game.creeps[name]) as Creep[];
        for (const creep of injuredCreeps) {
            if (!(creep instanceof Creep)) {
                console.log(`found a bad creep in injured creeps: ${creep}`);
            }
        }

        const healedAmount = (healer: Agent, shortRange: boolean) => {
            let healPerPart = 4;
            if (this.boostLevel !== BoostLevel.Unboosted) {
                healPerPart *= 4;
            }
            if (shortRange) {
                healPerPart *= 3;
            }
            return healer.partCount(HEAL) * healPerPart;
        };

        const closeRange = _(this.healer.pos.findInRange(injuredCreeps, 1))
            .sortBy("hits")
            .head();
        if (closeRange) {
            if (!this.healer) console.log("no healer?");
            const outcome = this.healer.heal(closeRange);
            if (outcome !== OK) console.log(`healing error: ${outcome}`);
            this.raidData.injuredCreeps[closeRange.name] += healedAmount(this.healer, true);
            if (this.raidData.injuredCreeps[closeRange.name] > closeRange.hitsMax) {
                delete this.raidData.injuredCreeps[closeRange.name];
            }
            return;
        }

        const longRange = _(this.healer.pos.findInRange(injuredCreeps, 3))
            .sortBy("hits")
            .head();
        if (longRange) {
            if (!this.healer) console.log("no healer?");
            const outcome = this.healer.rangedHeal(longRange);
            if (outcome !== OK) console.log(`healing error: ${outcome}`);
            this.raidData.injuredCreeps[longRange.name] += healedAmount(this.healer, true);
            if (this.raidData.injuredCreeps[longRange.name] > longRange.hitsMax) {
                delete this.raidData.injuredCreeps[longRange.name];
            }
            return;
        }

        if (this.healer.room.name === this.raidData.breachFlags[0].pos.roomName) {
            this.healer.heal(this.attacker);
        }
    }

    private attackCreeps(): boolean {
        const creepTargets = _(this.attacker.pos.findInRange(this.attacker.room.hostiles, 3))
            .filter((c: Creep) => _.filter(c.pos.lookFor(LOOK_STRUCTURES),
                (s: Structure) => s.structureType === STRUCTURE_RAMPART).length === 0)
            .sortBy("hits")
            .value();

        if (creepTargets.length === 0) {
            return false;
        }

        const closest = this.attacker.pos.findClosestByRange(creepTargets);
        const range = this.attacker.pos.getRangeTo(closest);

        if (range === 1 || creepTargets.length > 1) {
            this.attacker.rangedMassAttack();
        }
        else {
            this.attacker.rangedAttack(closest);
        }

        if (range === 1 && this.attacker.partCount(ATTACK)) {
            this.attacker.attack(closest);
            return true;
        }

        if (this.attacker.partCount(RANGED_ATTACK) > 1) {
            return true;
        }
    }

    private preparePhase() {
        if (this.attacker && !this.healer) {
            const closest = this.attacker.pos.findClosestByRange(this.room.hostiles);
            if (closest) {
                const range = this.attacker.pos.getRangeTo(closest);
                if (range <= this.attackRange) {
                    this.attacker.attack(closest);
                    this.attacker.rangedAttack(closest);
                    if (range < this.attackRange) {
                        this.attacker.retreat([closest]);
                    }
                }
                else {
                    this.attacker.travelTo(closest);

                }
            }
            else if (this.attacker.room === this.raidData.attackRoom) {
                const _closest = this.attacker.pos.findClosestByRange<Structure>(this.raidData.targetStructures);
                if (_closest) {
                    if (this.attacker.pos.inRangeTo(_closest, this.attackRange)) {
                        this.attacker.dismantle(_closest);
                        this.attacker.attack(_closest);
                        this.attacker.rangedMassAttack();
                    }
                    else {
                        this.attacker.travelTo(_closest);
                    }
                }
            }
            else {
                this.attacker.idleOffRoad(this.flag);
            }
        }

        if (this.healer && !this.attacker) {
            this.healCreeps();
            this.healer.idleOffRoad(this.flag);
        }

        return this.attacker && this.healer;
    }

    private raidTalk() {
        if (this.attacker.hits < this.attacker.hitsMax) {
            this.attacker.say("" + this.attacker.hits);
        }

        if (this.healer.hits < this.healer.hitsMax) {
            this.healer.say("" + this.healer.hits);
        }
    }

    protected focusCreeps() {

        if (!this.attacksCreeps) {
            return false;
        }

        const closest = this.attacker.pos.findClosestByRange(_.filter(this.attacker.room.hostiles, (c: Creep) => {
            return c.owner.username !== "Source Keeper" && c.body.length > 10;
        }));
        if (closest) {
            const range = this.attacker.pos.getRangeTo(closest);
            if (range > 1) {
                Agent.squadTravel(this.attacker, this.healer, closest);
            }
            else if (range === 1 && this.healer.fatigue === 0) {
                this.attacker.move(this.attacker.pos.getDirectionTo(closest));
                if (this.healer.pos.getRangeTo(this.attacker) === 1) {
                    this.healer.move(this.healer.pos.getDirectionTo(this.attacker));
                }
                else {
                    this.healer.travelTo(this.attacker);
                }
            }
            return true;
        }
        else {
            return false;
        }
    }

    private findMissionTarget(possibleTargets: Array<{ pos: RoomPosition, id: string }>) {
        if (this.attacker.memory.attackTargetId) {
            const target = Game.getObjectById<{ pos: RoomPosition, id: string }>(this.attacker.memory.attackTargetId);
            if (target && this.hasValidPath(this.attacker, target)) {
                return target;
            }
            else {
                delete this.attacker.memory.attackTargetId;
                return this.findMissionTarget(possibleTargets);
            }
        }
        else {
            const closest = this.attacker.pos.findClosestByRange<{ pos: RoomPosition, id: string }>(possibleTargets);
            if (!closest) {
                return;
            }
            if (this.hasValidPath(this.attacker, closest)) {
                this.attacker.memory.attackTargetId = closest.id;
                return closest;
            }
            const sortedTargets = _.sortBy(possibleTargets,
                (s: Structure) => this.attacker.pos.getRangeTo(s));
            for (const target of sortedTargets) {
                if (this.hasValidPath(this.attacker, target)) {
                    this.attacker.memory.structureTargetId = target.id;
                    return target;
                }
            }
        }
    }

    private hasValidPath(origin: { pos: RoomPosition }, destination: { pos: RoomPosition }): boolean {
        const obstacles = _.filter(this.raidData.obstacles, (c: Agent) => c !== this.attacker);
        const ret = empire.traveler.findTravelPath(origin, destination, {obstacles});
        return !ret.incomplete;
    }
}
