// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/WagrDuelEscrow.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function envAddress(string calldata name, string calldata delimiter) external returns (address[] memory);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployWagrDuelEscrow {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (WagrDuelEscrow escrow) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address[] memory attesters = vm.envAddress("WAGR_ATTESTERS", ",");
        uint256 threshold = vm.envUint("WAGR_ATTESTER_THRESHOLD");
        uint256 challengeWindow = vm.envUint("WAGR_CHALLENGE_WINDOW_SECONDS");
        uint256 gracePeriod = vm.envUint("WAGR_RESOLUTION_GRACE_SECONDS");

        vm.startBroadcast(deployerPrivateKey);
        escrow = new WagrDuelEscrow(owner, attesters, threshold, challengeWindow, gracePeriod);
        vm.stopBroadcast();
    }
}
