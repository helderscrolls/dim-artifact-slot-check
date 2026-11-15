/* Made-up profile data shaped like Bungie's GetProfile response, plus a fake
 * fetch so the extension scripts can run on the test page without DIM. */
(function () {
  var UNSET = 2166136261;
  var ARTIFACT_BUCKET = 1506418338;
  var RESET = 999;
  var EMPTY = 900;
  var P = {
    siphon: 101, marksman: 102, refraction: 103, harvest: 104, shuttle: 105, supercharger: 106,
    limit: 107, dielectric: 108, orbs: 109, weave: 110, flashover: 111, blast: 112, shreds: 113,
  };

  var truth = [P.siphon, P.marksman, P.refraction, P.harvest, P.shuttle, P.supercharger, P.limit, RESET];
  var swapped = [P.siphon, P.marksman, P.refraction, P.shuttle, P.harvest, P.supercharger, P.limit, RESET];
  var buddy = [P.dielectric, P.orbs, P.weave, P.flashover, P.shuttle, P.blast, P.shreds, RESET];
  var partial = [P.siphon, UNSET, EMPTY, EMPTY, UNSET, P.supercharger, UNSET, RESET];

  function loadout(nameHash, artifactId, plugs) {
    var items = [{ itemInstanceId: 'W1', plugItemHashes: [1, 2, 2, 3] }];
    if (artifactId) items.push({ itemInstanceId: artifactId, plugItemHashes: plugs });
    return { colorHash: 1, iconHash: 1, nameHash: nameHash, items: items };
  }
  var empty = { colorHash: 0, iconHash: 0, nameHash: 0, items: [{ itemInstanceId: '0', plugItemHashes: [] }] };

  var profile = {
    characters: { data: { C1: { classType: 2 }, C2: { classType: 1 } } },
    profileInventory: { data: { items: [] } },
    characterInventories: { data: { C1: { items: [{ itemInstanceId: 'W1', itemHash: 5, bucketHash: 1 }] } } },
    characterEquipment: {
      data: {
        C1: { items: [{ itemInstanceId: 'A1', itemHash: 7001, bucketHash: ARTIFACT_BUCKET }] },
        C2: { items: [{ itemInstanceId: 'A2', itemHash: 7002, bucketHash: ARTIFACT_BUCKET }] },
      },
    },
    itemComponents: {
      sockets: {
        data: {
          A1: { sockets: swapped.map(function (h) { return { plugHash: h, isEnabled: true }; }) },
          // The hunter's one slot saved `truth`, but the artifact was rearranged since.
          A2: { sockets: swapped.map(function (h) { return { plugHash: h, isEnabled: true }; }) },
        },
      },
    },
    characterLoadouts: {
      data: {
        C1: {
          loadouts: [
            loadout(11, 'A1', truth),
            loadout(12, 'A1', swapped),
            loadout(13, 'A1', buddy),
            empty,
            loadout(14, null),
            loadout(15, 'A1', partial),
          ],
        },
        C2: { loadouts: [loadout(11, 'A2', truth), empty] },
      },
    },
  };

  var itemDefs = { 7001: { displayProperties: { name: 'Tablet of Ruin' } }, 7002: { displayProperties: { name: 'Implement of Curiosity' } } };
  var perkNames = {
    siphon: 'Elemental Siphon', marksman: 'Volatile Marksman', refraction: 'Harsh Refraction',
    harvest: 'Maligned Harvest', shuttle: 'Horde Shuttle', supercharger: 'Elemental Supercharger',
    limit: 'Limit Break', dielectric: 'Dielectric', orbs: 'Unraveling Orbs', weave: 'Vile Weave',
    flashover: 'Flashover', blast: 'Defibrillating Blast', shreds: 'To Shreds',
  };
  Object.keys(P).forEach(function (k) { itemDefs[P[k]] = { displayProperties: { name: perkNames[k] } }; });
  var loadoutNames = { 11: { name: 'Void' }, 12: { name: 'Boss DPS' }, 13: { name: 'Prismatic' }, 14: { name: 'PvP' }, 15: { name: 'Solar' } };

  var routes = [
    [/\/Platform\/Destiny2\/Manifest\//, { Response: { jsonWorldComponentContentPaths: { en: {
      DestinyInventoryItemLiteDefinition: '/fake/items.json',
      DestinyLoadoutNameDefinition: '/fake/loadoutnames.json',
    } } } }],
    [/\/Platform\/Destiny2\/3\/Profile\/123\//, { Response: profile }],
    [/\/fake\/items\.json/, itemDefs],
    [/\/fake\/loadoutnames\.json/, loadoutNames],
  ];

  window.FIXTURE = { profile: profile, P: P };
  window.fetchLog = [];
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : input.url;
    window.fetchLog.push(url);
    for (var i = 0; i < routes.length; i++) {
      if (routes[i][0].test(url)) {
        return Promise.resolve(new Response(JSON.stringify(routes[i][1]), { status: 200 }));
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
})();
