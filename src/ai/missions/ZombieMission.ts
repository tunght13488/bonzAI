import {notifier} from "../../notifier";
import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";
import {RaidGuru} from "./RaidGuru";

enum ZombieStatus { Attack, Upgrade, Hold, Complete }

export class ZombieMission extends Mission {

    public zombies: Agent[];
    public guru: RaidGuru;

    constructor(operation: Operation, raidGuru: RaidGuru) {
        super(operation, "zombie");
        this.guru = raidGuru;
    }

    public initMission() {
        this.guru.init(this.flag.pos.roomName, true);
    }

    public roleCall() {

        const max = () => this.status === ZombieStatus.Attack ? 1 : 0;

        this.zombies = this.headCount("zombie", this.getBody, max, {
            memory: {boosts: this.boost, safeCount: 0},
            prespawn: this.memory.prespawn,
            skipMoveToRoom: true,
            blindSpawn: true,
        });
    }

    public missionActions() {
        for (const zombie of this.zombies) {
            this.zombieActions(zombie);
        }
    }

    public finalizeMission() {

        if (this.status === ZombieStatus.Complete) {
            notifier.log(`ZOMBIE: mission complete in ${this.room.name}`);
            this.flag.remove();
        }
    }

    public invalidateMissionCache() {
    }

    private zombieActions(zombie: Agent) {

        const currentlyHealing = this.healWhenHurt(zombie, this.guru.expectedDamage / 10) === OK;
        this.massRangedAttackInRoom(zombie);

        // retreat condition
        let threshold = 500;
        if (this.boost) {
            threshold = 250;
        }
        if (!this.isFullHealth(zombie, threshold)) {
            zombie.memory.reachedFallback = false;
        }

        if (!zombie.memory.reachedFallback) {
            if (zombie.isNearTo(this.guru.fallbackPos) && this.isFullHealth(zombie)) {
                this.registerPrespawn(zombie);
                zombie.memory.reachedFallback = true;
            }
            zombie.travelTo({pos: this.guru.fallbackPos});
            return;
        }

        if (zombie.pos.isNearExit(0)) {
            if (this.isFullHealth(zombie)) {zombie.memory.safeCount++; }
            else {zombie.memory.safeCount = 0; }
            console.log(zombie.creep.hits, zombie.memory.safeCount);
            if (zombie.memory.safeCount < 10) {
                return;
            }
        }
        else {
            zombie.memory.safeCount = 0;
        }

        const destination = this.findDestination(zombie);

        const returnData: { nextPos: RoomPosition } = {nextPos: undefined};
        this.moveZombie(zombie, destination, zombie.memory.demolishing, returnData);
        zombie.memory.demolishing = false;
        if (zombie.pos.roomName === this.room.name && !zombie.pos.isNearExit(0)) {
            if (!returnData.nextPos) return;
            const structure = returnData.nextPos.lookFor<Structure>(LOOK_STRUCTURES)[0];
            if (structure && structure.structureType !== STRUCTURE_ROAD) {
                zombie.memory.demolishing = true;
                if (!currentlyHealing) {
                    zombie.attack(structure);
                }
            }
        }
    }

    private moveZombie(agent: Agent, destination: { pos: RoomPosition }, demolishing: boolean,
                       returnData: { nextPos: RoomPosition }): number | RoomPosition {

        const roomCallback = (roomName: string) => {
            if (roomName === this.guru.raidRoomName) {
                const matrix = this.guru.matrix;

                // add other zombies, whitelist nearby exits, and attack same target
                for (const otherZomb of this.zombies) {
                    if (agent === otherZomb || otherZomb.room !== this.room || otherZomb.pos.isNearExit(0)) { continue; }
                    matrix.set(otherZomb.pos.x, otherZomb.pos.y, 0xff);
                    for (let direction = 1; direction <= 8; direction++) {
                        const position = otherZomb.pos.getPositionAtDirection(direction);
                        if (position.isNearExit(0)) {
                            matrix.set(position.x, position.y, 1);
                        }
                        else if (position.lookForStructure(STRUCTURE_WALL) ||
                            position.lookForStructure(STRUCTURE_RAMPART)) {
                            const currentCost = matrix.get(position.x, position.y);
                            matrix.set(position.x, position.y, Math.ceil(currentCost / 2));
                        }
                    }
                }

                // avoid plowing into storages/terminals
                if (this.guru.raidRoom) {

                    for (const hostile of this.guru.raidRoom.hostiles) {
                        matrix.set(hostile.pos.x, hostile.pos.y, 0xff);
                    }
                    if (this.guru.raidRoom.storage) {
                        matrix.set(this.guru.raidRoom.storage.pos.x, this.guru.raidRoom.storage.pos.y, 0xff);
                    }

                    if (this.guru.raidRoom.terminal) {
                        matrix.set(this.guru.raidRoom.terminal.pos.x, this.guru.raidRoom.terminal.pos.y, 0xff);
                    }
                }

                return matrix;
            }
        };

        return agent.travelTo(destination, {
            ignoreStuck: demolishing,
            returnData,
            roomCallback,
        });
    }

    public findDestination(agent: Agent) {
        let destination: { pos: RoomPosition } = this.flag;
        if (agent.pos.roomName === destination.pos.roomName) {
            const closestSpawn = agent.pos.findClosestByRange<Structure>(
                this.room.findStructures<Structure>(STRUCTURE_SPAWN));
            if (closestSpawn) {
                destination = closestSpawn;
            }
        }
        return destination;
    }

    public getBody = (): string[] => {
        if (this.guru.expectedDamage === 0) {
            return this.workerBody(10, 0, 10);
        }
        if (this.boost) {
            const healCount = Math.ceil((this.guru.expectedDamage * .3) / (HEAL_POWER * 4)); // boosting heal and tough
            const moveCount = 10;
            const rangedAttackCount = 1;
            const toughCount = 8;
            const dismantleCount = MAX_CREEP_SIZE - moveCount - rangedAttackCount - toughCount - healCount;
            return this.configBody({
                [TOUGH]: toughCount, [WORK]: dismantleCount, [RANGED_ATTACK]: rangedAttackCount,
                [MOVE]: moveCount, [HEAL]: healCount,
            });
        }
        else {
            const healCount = Math.ceil(this.guru.expectedDamage / HEAL_POWER);
            const moveCount = 17; // move once every other tick
            const dismantleCount = MAX_CREEP_SIZE - healCount - moveCount;
            return this.configBody({[WORK]: dismantleCount, [MOVE]: 17, [HEAL]: healCount});
        }
    };

    public massRangedAttackInRoom(agent: Agent) {
        if (agent.room.name === this.guru.raidRoomName) {
            return agent.rangedMassAttack();
        }
    }

    public isFullHealth(agent: Agent, margin = 0) {
        return agent.hits >= agent.hitsMax - margin;
    }

    public healWhenHurt(agent: Agent, margin = 0) {
        if (agent.hits < agent.hitsMax - margin) {
            return agent.heal(agent);
        }
    }

    public attack(agent: Agent, target: Structure | Creep): number {
        if (target instanceof Structure && agent.partCount(WORK) > 0) {
            return agent.dismantle(target);
        }
        else {
            return agent.attack(target);
        }
    }

    get boost(): string[] {
        const BOOST_AVERAGE_HITS = 2000000;
        const BOOST_DRAIN_DAMAGE = 240;
        if (this.guru.expectedDamage > BOOST_DRAIN_DAMAGE || this.guru.avgWallHits > BOOST_AVERAGE_HITS) {
            return [RESOURCE_CATALYZED_GHODIUM_ALKALIDE, RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE,
                RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE, RESOURCE_CATALYZED_ZYNTHIUM_ACID];
        }
    }

    get status(): ZombieStatus {
        if (!this.guru.isInitiaized) { return; }
        if (!this.memory.status && !this.room) return ZombieStatus.Attack;

        const MAX_AVERAGE_HITS = 20000000;
        const MAX_DRAIN_DAMAGE = 1000;

        if (this.room) {
            if (this.room.findStructures<StructureSpawn>(STRUCTURE_SPAWN).length === 0) {
                this.memory.status = ZombieStatus.Complete;
            }
            else if (this.guru.expectedDamage > MAX_DRAIN_DAMAGE || this.guru.avgWallHits > MAX_AVERAGE_HITS) {
                this.memory.status = ZombieStatus.Upgrade;
            }
            else if (this.room.controller.safeMode) {
                this.memory.status = ZombieStatus.Hold;
            }
            else {
                this.memory.status = ZombieStatus.Attack;
            }
        }
        return this.memory.status;
    }
}
