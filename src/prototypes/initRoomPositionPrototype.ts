export function initRoomPositionPrototype() {
    RoomPosition.prototype.isNearExit = function (range: number): boolean {
        return this.x - range <= 0 || this.x + range >= 49
            || this.y - range <= 0 || this.y + range >= 49;
    };

    RoomPosition.prototype.getFleeOptions = function (roomObject: RoomObject): RoomPosition[] {
        const fleePositions = [];
        const currentRange = this.getRangeTo(roomObject);

        for (let i = 1; i <= 8; i++) {
            const fleePosition = this.getPositionAtDirection(i);
            if (fleePosition.x > 0 && fleePosition.x < 49 && fleePosition.y > 0 && fleePosition.y < 49) {
                const rangeToHostile = fleePosition.getRangeTo(roomObject);
                if (rangeToHostile > 0) {
                    if (rangeToHostile < currentRange) {
                        fleePosition.veryDangerous = true;
                    }
                    else if (rangeToHostile === currentRange) {
                        fleePosition.dangerous = true;
                    }
                    fleePositions.push(fleePosition);
                }
            }
        }

        return fleePositions;
    };

    RoomPosition.prototype.bestFleePosition =
        function (hostile: Creep, ignoreRoads = false, swampRat = false): RoomPosition {
            let options = [];

            const fleeOptions = this.getFleeOptions(hostile);
            for (const option of fleeOptions) {
                const terrain = option.lookFor(LOOK_TERRAIN)[0];
                if (terrain !== "wall") {
                    const creepsInTheWay = option.lookFor(LOOK_CREEPS);
                    if (creepsInTheWay.length === 0) {
                        const structures = option.lookFor(LOOK_STRUCTURES);
                        let hasRoad = false;
                        let impassible = false;
                        for (const structure of structures) {
                            if (_.includes(OBSTACLE_OBJECT_TYPES, structure.structureType)) {
                                // can't go through it
                                impassible = true;
                                break;
                            }
                            if (structure.structureType === STRUCTURE_ROAD) hasRoad = true;
                        }

                        if (!impassible) {
                            let preference = 0;

                            if (option.dangerous) {
                                preference += 10;
                            }
                            else if (option.veryDangerous) {
                                preference += 20;
                            }

                            if (hasRoad) {
                                if (ignoreRoads) {
                                    preference += 2;
                                }
                                else {
                                    preference += 1;
                                }
                            }
                            else if (terrain === "plain") {
                                preference += 2;
                            }
                            else if (terrain === "swamp") {
                                if (swampRat) {
                                    preference += 1;
                                }
                                else {
                                    preference += 5;
                                }
                            }

                            options.push({position: option, preference});
                        }
                    }
                }
            }

            if (options.length > 0) {
                options = _(options)
                    .shuffle()
                    .sortBy("preference")
                    .value();

                return options[0].position;
            }
        };

    /**
     * Returns all surrounding positions that are currently open
     * @param ignoreCreeps - if true, will consider positions containing a creep to be open
     * @returns {RoomPosition[]}
     */
    RoomPosition.prototype.openAdjacentSpots = function (ignoreCreeps?: boolean): RoomPosition[] {
        const positions = [];
        for (let i = 1; i <= 8; i++) {
            const testPosition = this.getPositionAtDirection(i);

            if (testPosition.isPassable(ignoreCreeps)) {
                // passed all tests
                positions.push(testPosition);
            }
        }
        return positions;
    };

    /**
     * returns position at direction relative to this position
     * @param direction
     * @param range - optional, can return position with linear distance > 1
     * @returns {RoomPosition}
     */
    RoomPosition.prototype.getPositionAtDirection = function (direction: number, range?: number): RoomPosition {
        if (!range) {
            range = 1;
        }
        let x = this.x;
        let y = this.y;
        const room = this.roomName;

        if (direction === 1) {
            y -= range;
        }
        else if (direction === 2) {
            y -= range;
            x += range;
        }
        else if (direction === 3) {
            x += range;
        }
        else if (direction === 4) {
            x += range;
            y += range;
        }
        else if (direction === 5) {
            y += range;
        }
        else if (direction === 6) {
            y += range;
            x -= range;
        }
        else if (direction === 7) {
            x -= range;
        }
        else if (direction === 8) {
            x -= range;
            y -= range;
        }
        return new RoomPosition(x, y, room);
    };

    /**
     * Look if position is currently open/passable
     * @param ignoreCreeps - if true, consider positions containing creeps to be open
     * @returns {boolean}
     */
    RoomPosition.prototype.isPassable = function (ignoreCreeps?: boolean): boolean {
        if (this.isNearExit(0)) return false;

        // look for walls
        if (_.head(this.lookFor(LOOK_TERRAIN)) !== "wall") {

            // look for creeps
            if (ignoreCreeps || this.lookFor(LOOK_CREEPS).length === 0) {

                // look for impassible structure
                if (_.filter(this.lookFor(LOOK_STRUCTURES), (structure: Structure) => {
                    return structure.structureType !== STRUCTURE_ROAD
                        && structure.structureType !== STRUCTURE_CONTAINER
                        && structure.structureType !== STRUCTURE_RAMPART;
                }).length === 0) {

                    // passed all tests
                    return true;
                }
            }
        }

        return false;
    };

    /**
     * @param structureType
     * @returns {Structure} structure of type structureType that resides at position (null if no structure of that type
     *     is present)
     */
    RoomPosition.prototype.lookForStructure = function (structureType: string): Structure {
        const structures = this.lookFor(LOOK_STRUCTURES);
        return _.find(structures, {structureType}) as Structure;
    };
}
