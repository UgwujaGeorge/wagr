// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/WagrDuelEscrow.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployWagrDuelEscrow {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (WagrDuelEscrow escrow) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envAddress("OWNER_ADDRESS");
        address resolver = vm.envAddress("WAGR_RESOLVER_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        escrow = new WagrDuelEscrow(owner, resolver);
        vm.stopBroadcast();
    }
}
