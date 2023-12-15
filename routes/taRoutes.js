const express = require('express');
const { getBootstrapData, getMaps, getTeamGWData, getTeamData } = require('../lib/fplAPIWrapper');
const { getPlayerInfo } = require('../lib/playerInfo');
const router = express.Router();

router.get('/:teamID/:gameweek', async (req, res) => {
    try {
        const { teamID, gameweek } = req.params;

        // Fetch general information (players and teams)
        const bootstrapData = await getBootstrapData(req);
        const dataMap = await getMaps(bootstrapData);

        // Fetch team details
        const teamResponse = await getTeamGWData(req, teamID, gameweek);
        // Check if team response is not found
        if (teamResponse.data.length === 0) {
            res.json({ data: false, source: bootstrapData.source, apiLive: bootstrapData.apiLive });
        }
        else {
            // First, sort the picks array by position
            const sortedPicks = teamResponse.data.picks.sort((a, b) => a.position - b.position);

            // Then, extract the player IDs
            const startingPlayerIDs = sortedPicks.filter(pick => pick.position <= 11).map(pick => pick.element);
            const benchPlayerIDs = sortedPicks.filter(pick => pick.position > 11).map(pick => pick.element);

            const startingPlayers = bootstrapData.data.elements.filter(player => startingPlayerIDs.includes(player.id));
            const benchPlayers = bootstrapData.data.elements.filter(player => benchPlayerIDs.includes(player.id));

            // Create index maps for starting and bench player IDs
            const startingPlayerIndexMap = startingPlayerIDs.reduce((acc, id, index) => {
                acc[id] = index;
                return acc;
            }, {});

            const benchPlayerIndexMap = benchPlayerIDs.reduce((acc, id, index) => {
                acc[id] = index;
                return acc;
            }, {});

            // Sort the startingPlayers and benchPlayers arrays based on the index maps
            const sortedStartingPlayers = startingPlayers.sort((a, b) => startingPlayerIndexMap[a.id] - startingPlayerIndexMap[b.id]);
            const sortedBenchPlayers = benchPlayers.sort((a, b) => benchPlayerIndexMap[a.id] - benchPlayerIndexMap[b.id]);


            const teamInfoResponse = await getTeamData(req, teamID);

            // Extract manager's name, overall points, and overall rank from the response
            const managerName = `${teamInfoResponse.data.player_first_name} ${teamInfoResponse.data.player_last_name}`;
            const overallPoints = teamInfoResponse.data.summary_overall_points;
            const overallRank = teamInfoResponse.data.summary_overall_rank;

            // Enrich player details with past and upcoming fixtures
            const detailedStartingPlayers = await getPlayersInfo(req, sortedStartingPlayers, dataMap);
            const detailedBenchPlayers = await getPlayersInfo(req, sortedBenchPlayers, dataMap);

            // Construct the final response
            const responseData = {
                managerName,
                overallRank,
                overallPoints,  // Current gameweek score
                playersStarting: detailedStartingPlayers,
                playersBench: detailedBenchPlayers
            };

            res.json({ data: responseData, source: bootstrapData.source, apiLive: bootstrapData.apiLive });
        }
    } catch (error) {
        console.log("Error getting TeamID-GW info");
        console.error(error);
    }
});

async function getPlayersInfo(req, players, dataMap) {
    return await Promise.all(players.map(async (player) => {
        return await getPlayerInfo(req, player, dataMap);
    }));
}

module.exports = router;
