// Generated from contracts/base/out/WagrDuelEscrow.sol/WagrDuelEscrow.json. Do not edit by hand.
// Regenerate with: npm run contracts:abi

export const wagrDuelEscrowAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "initialOwner",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "initialAttesters",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "initialThreshold",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "initialChallengeWindow",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "initialResolutionGracePeriod",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "MAX_CHALLENGE_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_RESOLUTION_GRACE_PERIOD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_CHALLENGE_WINDOW",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_RESOLUTION_GRACE_PERIOD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "acceptDuel",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "addAttester",
    "inputs": [
      {
        "name": "attester",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "attesterCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "attesters",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelOpenDuel",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "challengeVerdict",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "challengeWindow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claimPayout",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimRefund",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "counterpartySide",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Side"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "createDuel",
    "inputs": [
      {
        "name": "creatorSide",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Side"
      },
      {
        "name": "expiry",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "duelStateHash",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "duels",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "counterparty",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creatorSide",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Side"
      },
      {
        "name": "stakeAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.DuelStatus"
      },
      {
        "name": "verdict",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Verdict"
      },
      {
        "name": "creatorClaimed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "counterpartyClaimed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "createdAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "acceptedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "resolvedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verdictProposedAt",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verdictHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "genlayerTxHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "finalizeChallenge",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "finalizeVerdict",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getDuel",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct WagrDuelEscrow.Duel",
        "components": [
          {
            "name": "creator",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "counterparty",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "creatorSide",
            "type": "uint8",
            "internalType": "enum WagrDuelEscrow.Side"
          },
          {
            "name": "stakeAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expiry",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "metadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum WagrDuelEscrow.DuelStatus"
          },
          {
            "name": "verdict",
            "type": "uint8",
            "internalType": "enum WagrDuelEscrow.Verdict"
          },
          {
            "name": "creatorClaimed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "counterpartyClaimed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "createdAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "acceptedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "resolvedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "verdictProposedAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "verdictHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "genlayerTxHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "confidenceBps",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isAttester",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markResolutionRequested",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "markResolutionTimedOut",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextDuelId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "removeAttester",
    "inputs": [
      {
        "name": "attester",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "resolutionGracePeriod",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setChallengeWindow",
    "inputs": [
      {
        "name": "newWindow",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setResolutionGracePeriod",
    "inputs": [
      {
        "name": "newPeriod",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setThreshold",
    "inputs": [
      {
        "name": "newThreshold",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitVerdict",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verdict",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Verdict"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "verdictHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "genlayerTxHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "signatures",
        "type": "bytes[]",
        "internalType": "bytes[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "threshold",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "newOwner",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "verdictDigest",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verdict",
        "type": "uint8",
        "internalType": "enum WagrDuelEscrow.Verdict"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "verdictHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "genlayerTxHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "winnerOf",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "AttesterAdded",
    "inputs": [
      {
        "name": "attester",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AttesterRemoved",
    "inputs": [
      {
        "name": "attester",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ChallengeWindowUpdated",
    "inputs": [
      {
        "name": "oldWindow",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newWindow",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DuelAccepted",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "counterparty",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DuelCanceled",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DuelCreated",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creatorSide",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum WagrDuelEscrow.Side"
      },
      {
        "name": "stakeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "expiry",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "OwnershipTransferred",
    "inputs": [
      {
        "name": "previousOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "newOwner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PayoutClaimed",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "winner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RefundClaimed",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "user",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ResolutionGracePeriodUpdated",
    "inputs": [
      {
        "name": "oldPeriod",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newPeriod",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ResolutionRequested",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ResolutionTimedOut",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ThresholdUpdated",
    "inputs": [
      {
        "name": "oldThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newThreshold",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VerdictChallenged",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "challenger",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VerdictProposed",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "verdict",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum WagrDuelEscrow.Verdict"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "verdictHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "genlayerTxHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "attestationCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VerdictSubmitted",
    "inputs": [
      {
        "name": "duelId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "verdict",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum WagrDuelEscrow.Verdict"
      },
      {
        "name": "confidenceBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "metadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "verdictHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "genlayerTxHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyClaimed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ChallengeWindowClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ChallengeWindowOpen",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CreatorCannotAccept",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuelExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuelNotExpired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuelStateHashMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicateAttester",
    "inputs": []
  },
  {
    "type": "error",
    "name": "GracePeriodNotElapsed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IncorrectStake",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientAttestations",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAttesterSet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfidence",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidExpiry",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidGenLayerTxHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidMetadata",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSide",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSignature",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidStake",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidStatus",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidThreshold",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidVerdict",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidVerdictHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidWindow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MetadataHashMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAnAttester",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotParticipant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotWinner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnorderedSignatures",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const
