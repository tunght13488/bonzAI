import {Agent} from "../ai/missions/Agent";
import {ROOMTYPE_ALLEY, ROOMTYPE_CONTROLLER, ROOMTYPE_CORE, ROOMTYPE_SOURCEKEEPER, WorldMap} from "../ai/WorldMap";
import {empire} from "../helpers/loopHelper";

export function initRoomPrototype() {
    Object.defineProperty(Room.prototype, "hostiles", {
        get: function myProperty() {
            if (!Game.cache.hostiles[this.name]) {
                const hostiles = this.find(FIND_HOSTILE_CREEPS) as Creep[];
                const filteredHostiles = [];
                for (const hostile of hostiles) {
                    const username = hostile.owner.username;
                    const isEnemy = empire.diplomat.checkEnemy(username, this.name);
                    if (isEnemy) {
                        filteredHostiles.push(hostile);
                    }
                }
                Game.cache.hostiles[this.name] = filteredHostiles;
            }
            return Game.cache.hostiles[this.name];
        },
    });

    // deprecated
    Object.defineProperty(Room.prototype, "hostilesAndLairs", {
        get: function myProperty() {
            if (!Game.cache.hostilesAndLairs[this.name]) {
                const lairs = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR), (lair: StructureKeeperLair) => {
                    return !lair.ticksToSpawn || lair.ticksToSpawn < 10;
                });
                Game.cache.hostilesAndLairs[this.name] = lairs.concat(this.hostiles);
            }
            return Game.cache.hostilesAndLairs[this.name];
        },
    });

    Object.defineProperty(Room.prototype, "roomType", {
        get: function myProperty(): number {
            if (!this.memory.roomType) {

                // source keeper
                const lairs = this.findStructures(STRUCTURE_KEEPER_LAIR);
                if (lairs.length > 0) {
                    this.memory.roomType = ROOMTYPE_SOURCEKEEPER;
                }

                // core
                if (!this.memory.roomType) {
                    const sources = this.find(FIND_SOURCES);
                    if (sources.length === 3) {
                        this.memory.roomType = ROOMTYPE_CORE;
                    }
                }

                // controller rooms
                if (!this.memory.roomType) {
                    if (this.controller) {
                        this.memory.roomType = ROOMTYPE_CONTROLLER;
                    }
                    else {
                        this.memory.roomType = ROOMTYPE_ALLEY;
                    }
                }
            }
            return this.memory.roomType;
        },
    });

    Object.defineProperty(Room.prototype, "structures", {
        get: function myProperty() {
            if (!Game.cache.structures[this.name]) {
                Game.cache.structures[this.name] =
                    _.groupBy(this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
            }
            return Game.cache.structures[this.name] || [];
        },
    });

    /**
     * Returns array of structures, caching results on a per-tick basis
     * @param structureType
     * @returns {Structure[]}
     */
    Room.prototype.findStructures = function (structureType: string): Structure[] {
        if (!Game.cache.structures[this.name]) {
            Game.cache.structures[this.name] = _.groupBy(this.find(FIND_STRUCTURES), (s: Structure) => s.structureType);
        }
        return Game.cache.structures[this.name][structureType] || [];
    };

    /**
     * Finds creeps and containers in missionRoom that will give up energy, primarily useful when a storage is not
     * available Caches results on a per-tick basis. Useful before storage is available or in remote mining rooms.
     * @param roomObject - When this optional argument is supplied, return closest source
     * @returns {StructureContainer|Creep} - Returns source with highest amount of available energy, unless roomObject
     *     is supplied
     */
    Room.prototype.getAltBattery = function (roomObject?: RoomObject): StructureContainer | Creep {
        if (!this.altBatteries) {
            const possibilities = [];
            const containers = this.findStructures(STRUCTURE_CONTAINER);
            if (this.controller && this.controller.getBattery() instanceof StructureContainer) {
                _.pull(containers, this.controller.getBattery());
            }
            for (const container of containers) {
                if (container.store.energy >= 50) {
                    possibilities.push(container);
                }
            }
            const creeps = this.find(FIND_MY_CREEPS, {filter: (c: Creep) => c.memory.donatesEnergy});
            for (const creep of creeps) {
                if (creep.carry.energy >= 50) {
                    possibilities.push(creep);
                }
            }
            if (this.terminal && this.terminal.store.energy >= 50) {
                possibilities.push(this.terminal);
            }
            this.altBatteries = _.sortBy(possibilities, (p: Creep | StructureContainer) => {
                return Agent.normalizeStore((p)).store.energy;
            });
        }
        if (roomObject) {
            return roomObject.pos.findClosestByRange(this.altBatteries) as StructureContainer | Creep;
        }
        else {
            return _.last(this.altBatteries) as StructureContainer | Creep;
        }
    };

    /**
     * Returns missionRoom coordinates for a given missionRoom
     * @returns {*}
     */

    Object.defineProperty(Room.prototype, "coords", {
        get: function myProperty() {
            if (!this.memory.coordinates) {
                this.memory.coordinates = WorldMap.getRoomCoordinates(this.name);
            }
            return this.memory.coordinates;
        },
    });

    Object.defineProperty(Room.prototype, "defaultMatrix", {
        get: function myProperty() {
            return empire.traveler.getStructureMatrix(this);
        },
    });

    Object.defineProperty(Room.prototype, "fleeObjects", {
        get: function myProperty() {
            if (!Game.cache.fleeObjects[this.name]) {
                let fleeObjects = _.filter(this.hostiles, (c: Creep): boolean => {
                    return _.find(c.body, (part: BodyPartDefinition) => {
                        return part.type === ATTACK || part.type === RANGED_ATTACK;
                    }) !== null;
                });

                if (this.roomType === ROOMTYPE_SOURCEKEEPER) {
                    fleeObjects = fleeObjects.concat(this.lairThreats);
                }

                Game.cache.fleeObjects[this.name] = fleeObjects;
            }

            return Game.cache.fleeObjects[this.name];
        },
    });

    Object.defineProperty(Room.prototype, "lairThreats", {
        get: function myProperty() {
            if (!Game.cache.lairThreats[this.name]) {
                Game.cache.lairThreats[this.name] = _.filter(this.findStructures(STRUCTURE_KEEPER_LAIR),
                    (lair: StructureKeeperLair) => !lair.ticksToSpawn || lair.ticksToSpawn < 10);
            }
            return Game.cache.lairThreats[this.name];
        },
    });
}
