import {Operation} from "../operations/Operation";
import {Agent} from "./Agent";
import {Mission} from "./Mission";

interface EnergyStructure extends Structure {
    pos: RoomPosition;
    energy: number;
    energyCapacity: number;
}

export class RefillMission extends Mission {
    public carts: Agent[];
    public emergencyCarts: Agent[];
    public emergencyMode: boolean;
    public empties: EnergyStructure[];

    public memory: {
        cartsLastTick: number,
        max: number,
    };

    /**
     * General-purpose structure refilling. Can be used to refill spawning energy, towers, links, labs, etc.
     *  Will default to drawing energy from storage, and use altBattery if there is no storage with energy
     * @param operation
     */
    constructor(operation: Operation) {
        super(operation, "refill");
    }

    public initMission() {
        this.emergencyMode = this.memory.cartsLastTick === 0;
    }

    public roleCall() {
        const max = () => this.room.storage ? 1 : 2;
        const emergencyMax = () => this.emergencyMode ? 1 : 0;

        const emergencyBody = () => this.workerBody(0, 4, 2);
        this.emergencyCarts = this.headCount("emergency_" + this.name, emergencyBody, emergencyMax);

        const cartBody = () => {
            if (this.operation.type === "flex") {
                return this.bodyRatio(0, 2, 1, 1, 16);
            }
            else {
                return this.bodyRatio(0, 2, 1, 1, 10);
            }
        };

        const memory = {scavanger: RESOURCE_ENERGY};
        this.carts = this.headCount("spawnCart", cartBody, max, {prespawn: 50, memory});
        this.memory.cartsLastTick = this.carts.length;
    }

    public missionActions() {
        for (const cart of this.emergencyCarts) {
            this.spawnCartActions(cart, 0);
        }

        let order = 0;
        for (const cart of this.carts) {
            this.spawnCartActions(cart, order);
            order++;
        }
    }

    public spawnCartActions2(cart: Agent, order: number) {
        const hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (order !== 0 && cart.ticksToLive < 50) {
                cart.suicide();
                return;
            }
            cart.memory.emptyId = undefined;
            cart.procureEnergy(this.findNearestEmpty(cart), true);
            return;
        }
    }

    public spawnCartActions(cart: Agent, order: number) {
        const hasLoad = cart.hasLoad();
        if (!hasLoad) {
            if (order !== 0 && cart.ticksToLive < 50) {
                cart.suicide();
                return;
            }
            cart.memory.emptyId = undefined;
            cart.procureEnergy(this.findNearestEmpty(cart), true);
            return;
        }

        let target = this.findNearestEmpty(cart);
        if (!target) {
            if (cart.carry.energy < cart.carryCapacity * .8) {
                cart.memory.hasLoad = false;
            }
            else {
                cart.idleOffRoad(cart.room.controller);
            }
            return;
        }

        // has target
        if (!cart.pos.isNearTo(target)) {
            cart.travelTo(target);
            if (this.room.storage && cart.pos.isNearTo(this.room.storage) &&
                cart.carry.energy <= cart.carryCapacity - 50) {
                cart.withdraw(this.room.storage, RESOURCE_ENERGY);
            }
            return;
        }

        // is near to target
        const outcome = cart.transfer(target, RESOURCE_ENERGY);
        if (outcome === OK) {
            if (cart.carry.energy > target.energyCapacity) {
                cart.memory.emptyId = undefined;
                target = this.findNearestEmpty(cart, target);
                if (target && !cart.pos.isNearTo(target)) {
                    cart.travelTo(target);
                }
            }
            else if (this.room.storage) {
                cart.travelTo(this.room.storage);
            }
        }
    }

    public finalizeMission() {
    }

    public invalidateMissionCache() {
    }

    public findNearestEmpty(cart: Agent, pullTarget?: EnergyStructure): EnergyStructure {
        if (cart.memory.emptyId) {
            const empty = Game.getObjectById<EnergyStructure>(cart.memory.emptyId);
            if (empty && empty.energy < empty.energyCapacity) {
                const rangeToEmpty = cart.pos.getRangeTo(empty);
                const closestEmpty = cart.pos.findClosestByRange(this.getEmpties());
                const rangeToClosest = cart.pos.getRangeTo(closestEmpty);
                if (rangeToEmpty > rangeToClosest) {
                    cart.memory.emptyId = closestEmpty.id;
                    return closestEmpty;
                }
                else {
                    return empty;
                }
            }
            else {
                delete cart.memory.emptyId;
                return this.findNearestEmpty(cart, pullTarget);
            }
        }
        else {
            const closestEmpty = cart.pos.findClosestByRange<EnergyStructure>(this.getEmpties(pullTarget));
            if (closestEmpty) {
                cart.memory.emptyId = closestEmpty.id;
                return closestEmpty;
            }
        }
    }

    public getEmpties(pullTarget?: EnergyStructure): EnergyStructure[] {
        if (!this.empties) {
            this.empties = _.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_SPAWN)
                .concat(this.room.findStructures<EnergyStructure>(STRUCTURE_EXTENSION)), (s: StructureSpawn) => {
                return s.energy < s.energyCapacity;
            });
            this.empties = this.empties.concat(_.filter(this.room.findStructures<EnergyStructure>(STRUCTURE_TOWER),
                (s: StructureTower) => s.energy < s.energyCapacity * .5));
        }

        if (pullTarget) {
            _.pull(this.empties, pullTarget);
        }

        return this.empties;
    }
}
