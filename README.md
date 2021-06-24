
# ✨ So you want to sponsor a contest

This `README.md` contains a set of checklists for our contest collaboration.

Your contest will use two repos: 
- **a _contest_ repo** (this one), which is used for scoping your contest and for providing information to contestants (wardens)
- **a _findings_ repo**, where issues are submitted. (We'll set that one up later.) 

Ultimately, when we launch the contest, this contest repo will be made public and will contain the smart contracts to be reviewed and all the information needed for contest participants. The findings repo will be made public after the contest is over and your team has mitigated the identified issues.

Some of the checklists in this doc are for **C4 (🐺)** and some of them are for **you as the contest sponsor (⭐️)**.

---

# Contest prep

## 🐺 C4: Contest prep
- [ ] Add link to report form in contest details below
- [ ] Delete this checklist.

## ⭐️ Sponsor: Contest prep
- [ ] Make sure your code is thoroughly commented using the [NatSpec format](https://docs.soliditylang.org/en/v0.5.10/natspec-format.html#natspec-format).
- [ ] Modify the bottom of this `README.md` file to describe how your code is supposed to work with links to any relevent documentation and any other criteria/details that the C4 Wardens should keep in mind when reviewing
- [ ] Please have final versions of contracts and documentation added/updated in this repo **no less than 8 hours prior to contest start time.**
- [ ] Ensure that you have access to the _findings_ repo where issues will be submitted.
- [ ] Delete this checklist and all text above the line below when you're ready.

---

# Gro Protocol contest details
- $100,000 main award pot
- Join [C4 Discord](https://discord.gg/EY5dvm3evD) to register
- Submit findings [using the C4 form](https://[--NEED LINK--)
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Preview starts June 24 00:00 UTC (no submissions accepted)
- Preview ends June 30 23:59 UTC
- Contest Starts July 1 00:00 UTC
- Contest Ends July 7 23:59 UTC

This repo will be made public before the start of the contest. (C4 delete this line when made public)


| Glossary| |
|-------------------------------|------------------------------------------------------|
| PWRD (PWRD Stablecoin)| Rebasing stablecoin, native token of Gro protocol |
| GVT (Gro Vault Token)| Non-rebasing token, native token of Gro protocol |
| Utilisation Ratio| Ratio of PWRD to GVT value in the system |
| Curve pool (LP)| Curve AMM |
| LP (token)| Token that represent share in Liquidity Pool |
| Virtual price| USD price of LP token |
| Yearn Vault or yVault| Stable coin vault that invests into underlying strategies in order to generate yield |
| Sardine, Tuna, Whale| Deposit/Withdrawal sizes ranging from small to large |

# Contest Scope

This contest is open for two weeks to give wardens time to understand the protocol properly. Submissions can only be made in the second week of the contest. Representatives from gro will be available in the Code Arena Discord to answer any questions during the contest period. The focus for the contest is to try and find any logic errors or ways to drain funds from the protocol in a way that is advantageous for an attacker at the expense of users with funds invested in the protocol. We are NOT looking for gas savings in this contest. Wardens should assume that governance variables are set sensibly (unless they can find a way to change the value of a governance variable, and not counting social engineering approaches for this). 

## Protocol overview

Gro protocol is a yield aggregator built on top of a tranche.

The aim of gro protocol is to offer high yields for users who are willing to take on more risk, and a safer alternative for user who are risk averse. The protocol is able to do so by ensuring that any one of its portfolios exposures, be that to underlying assets or external defi protocols, are kept within a certain threshold.

 - PWRD: 
 A rebasing, yield generating stable coin pegged to the dollar. Its main feature is insurance against any individual protocol/stable coin failure, which it gets from the GVT. In return for this insurance, PWRD hands over part of its yield to GVT. 

 - GVT: 
The risk bearing asset, taking on the risk from PWRD in return for part of PWRD's yield. Unlike PWRD, GVT is not a rebasing stable coin. 

GVT is effectively underwriting the protection of the PWRD and the ratio of PWRD to the value of GVT is referred to as the utilisation ratio. Some yield from the PWRD gets transferred to the GVT based on the utilisation ratio of the two tokens, creating an incentive for the GVT to take on risk from PWRD. On the flip side, a stable coin or protocol failure will first and foremost be paid out from the GVT side, thus preventing PWRD holder from losing any assets in the eventuality of a hack or other issue.

Due to the nature of this relation, the system needs to be able to balance internal assets based on risk exposure to different assets and protocol - the failure of one asset/protocol can impact other assets/protocol and cause the insurance to fail. For this to work, the system gets a set allocation target for stable coin assets, which is the distribution of stable coins the system tries to meet. The investment of these stable coin assets into underlying yield bearing strategies is calculated based on the utilisation ratio of PWRD to GVT.

As profit and loss affects the exposures in the system, it has to measure its changing risk exposure, and in case this exposure is above a predefined margin the system will rebalance itself by swapping out assets.

The system will however try to mitigate this from happening by trying to balance itself whenever it invests or removes assets (large user deposits/withdrawals and system investments) by determining the difference between the target allocations, and the actual assets in the system (this is referred to as the delta), which is used as a basis for understanding how much of each asset needs to be added or removed from the system, continuously pushing it towards a balanced state.

This is all achieved by utilizing Curve as a swapping layer, meaning that the system can make decisions on what assets to move in and out independent of what assets the end user deposits/withdraws.

## Smart Contracts

All the contracts in this section are to be reviewed. Any contracts not in this list are to be ignored for this contest.
A further breakdown of [contracts and their dependencies can be found here](https://docs.google.com/spreadsheets/d/1iwl_WO95_x0lhU7ML5ejRdZ3PiLOWrygBvZJQRTurKc/edit?usp=sharing)

The Protocol is divided into 5 separate modules with different areas of concerns - [System Diagram](https://drive.google.com/file/d/1ueVEEmv19hydELJyLBtso5ksOIsl77lv/view?usp=sharing)

### Control flow [Diagrams](https://drive.google.com/file/d/1gCVQJzzSFLgDAXDK0ZwPg2fRA19CglOS/view?usp=sharing)
The control flow is primarily responsible for stringing the other modules together and user interactions. The controller acts as a hub, providing system level information to other modules. The withdraw and deposit handlers acts as entry points for users withdrawals and deposits respectively.
	
#### Controller.sol (330 sloc each)
Core contract connecting the separate modules, responsible for:

 - Connection Gtokens to protocol
	 - Minting/Burning tokens
	 - Establishing current total assets for pwrd/gvt
 - Allowing other contract to interact with PnL and insurance logic.
 - Access control (may block smart contracts)
 
#### WithdrawHandler.sol (260 sloc each)
 - Contract handling user withdrawals, responsible for:
  - Determining withdrawal logic path [single, balanced, size]
  - Transferring assets from protocol to user

#### DepositHandler.sol (132 sloc each)
Contract handling user Deposits, responsible for:
  - Determining Deposit logic path [small, large]
  - Transferring tokens from user to protocol

#### EmergencyHandler.sol (94 sloc each)
Alternate withdrawal logic, used in case of curve being compromised, or in the case of the failure of a stablecoin.

### Tokens [Diagrams](https://drive.google.com/file/d/1EVWhZYTtLGddp3SZFT8-ZpvunYClCVEj/view?usp=sharing)

#### GERC20.sol (323 sloc)
Custom implementation of the ERC20 specifications, built ontop of the OpenZepplin ERC20 implementation:
-	_burn: Added parameter - burnAmount added to take rebased amount into account, affects the Transfer event
-	_mint: Added parameter - mintAmount added to take rebased amount into account, affects the Transfer event
-	_transfer: Added parameter - transferAmount added to take rebased amount into account, affects the Transfer event 
-	_decreaseApproved: Added function - internal function to allowed override of transferFrom    

#### GToken.sol (55 sloc)
Base contract for gro protocol tokens. The Gtoken implements a factor that is established as the total amount of minted token over the total amount of assets invested in the token. The factor is then used to drive a desired behaviour in the implementing token.

##### Factor code:
```
function factor(uint256 totalAssets) public view override returns (uint256) {
	if (totalSupplyBase() == 0) {
		return BASE; // 1
	}
	if (totalAssets > 0) {
		return totalSupplyBase().mul(BASE).div(totalAssets);
	}
	return 0;
	}       
```
#### NonRebasingGToken.sol (60 sloc)
Implementation of the GToken contract, used the gtoken factor to establish a price per share, defined as:
```
 function getPricePerShare() public view override returns (uint256) {
    uint256 f = factor();
    return f > 0 ? BASE.mul(BASE).div(f) : 0;
 }         
```
#### RebasingGToken.sol (69 sloc)
Implementation of the GToken contract, used the gtoken factor to establish a balance of, defined as:
```
 function totalSupply() public view override returns (uint256) {
     uint256 f = factor();
     return f > 0 ? totalSupplyBase().mul(BASE).div(f) : 0;
 }
```
### Pricing and Swapping [Diagrams](https://drive.google.com/file/d/1rMx_RK7RsQYLxQXrvtp9skyVgJokN_gV/view?usp=sharing)
The system should have one base currency to calculate total assets based on multiple stable coins (one stable coin has one corresponding VaultAdapter). US Dollar (USD) is used as the base currency. The pricing and swapping modules responsibility is to get the dollar price for stable coins. Safety is the first requirement of this module.

#### LifeGuard3Pool.sol (308 sloc)
The lifeguard is responsible for any stable coin swapping the protocol performs. It interacts directly with the curve3pool. Additionally the lifeguard is responsible for:
 - Handling swaps during deposits and investing assets to stable coin vault adapters
 - Preparing stable coins to be invested for 3Crv, and invested  into the 3Crv vault adapter

#### Buoy3Pool.sol (172 sloc)
The Buoy acts as the protocol pricing oracle, and is responsible for providing pricing and sanity checking curves prices. The Buoy interacts with both Curve (3pool) and Chainlink.
	- Provides prices for rest of protocol
	- Sanity checks Curve prices against historical pricing points
	- Sanity checks Curve against Chainlinks aggregators 

### Insurance [Diagrams](https://drive.google.com/file/d/1Az4ThISghdIYcbgo6pYWjRqZ_PjLpaFr/view?usp=sharing)
The insurance module is responsible for the system's overall health. It provides functionality for establishing current exposure, and allows the system to route deposits and withdrawals to the correct target vaults. The main insurance functionality is supported by two contracts, allocation and exposure; these are replaceable contracts and act as individual strategies that are depending on the current protocol exposures in the system.

In addition to the core insurance contract, the PnL contract helps the protocol to distribute profit or losses from underlying vaults between GVT and PWRD according to the gro algorithm, and provide the system utilisation ratio (PWRD count / GVT total value).

#### Insurance.sol (340 sloc)
The insurance contract is the most important part of the protocol - it controls the system risk and gets profit from external protocols. Its main responsibilities are:

-   Calculate stable coin / protocol risk exposure
    
-   Rebalance system investment
    
-   Calculate distribution of assets for large deposits and withdrawals
    
The insurance contract shouldn't need to be replaced, as any changes to the protocol (e.g. changes in assets, strategies or protocol exposure) should be captured by the allocation and exposure contracts. These act as strategies for the main insurance contract.

#### Exposure.sol (214 sloc)
Allows the insurance module to calculate current exposure based on the current protocol setup

#### Allocation.sol (186 sloc)
Determines protocol stable coin stable coin, strategy allocations and thresholds based on the current protocol setup

#### PnL.sol (220 sloc)
The Pnl contract holds logic to deal with system profit and loss -It holds a snapshot of latest tvl split between Gvt and Pwrd, and updates this value as deposits/withdrawal, gains/losses etc occur. The following action can impact the systems TvL: 
	-	deposits/withdrawal: updates to TvL are handled through the control flow module (on user deposit/withdrawal)
	-	Yields (Strategy Gains/losses): reported back to the PnL contract during a harvest (realisation of yield)
	-	Holder bonuses: A fee taken from users on withdrawals and distributed to other protocol holders. This is realized on withdrawals
	-	Price changes: As the TvL is determined by by curves pricing. Price changes are realised during harvests, and only affect the GVT tokens total assets (independently if the realized price difference causes a gain or loss)

### Vaults and Strategies [Diagrams](https://drive.google.com/file/d/1hQHTY_tDFW5TYzgqyFb8IpZzP0LdSSaZ/view?usp=sharing)

#### BaseVaultAdaptor.sol (348 sloc)
Abstract contract containing additional logic that needs to be built ontop of any vault in order for it to function with gro protocol

#### VaultAdaptorYearnV2_032.sol (158 sloc)
Implementation of the vault adapter to interact with a modified version of the yearnV2 Vault

### Common contracts
Standard abstractions implemented by other contracts in the protocol

#### Whitelist.sol (21 sloc)
Access control logic
		
#### Controllable.sol (34 sloc)
Contracts relying on the Controller.sol contract
		
#### StructDefinitions.sol (37 sloc)
Defintions of structs used in the protocol
	
#### Constants.sol (11 sloc)
Constant values used accross the protocol:
	- Decimal constants
	
#### FixedContracts.sol (81 sloc)
Immutable and constant variables used accorss the protocol. Divided into:
	- Fixed GTokens (pwrd, gvt)
	- Fixed Stablecoins (DAI, USDC, USDT)
	- Fixed Vaults (gro protocol stablecoin vaults)

### Additional notes on smart contracts
[fill me in]

## Areas of concern
[fill me in]

## Tests
A full set of unit tests are provided in the repo.

## Testnet deployment

A working instance of gro protocol has been deployed on Kovan. All external contracts, with the exception of chain links aggregators, have been mocked. Strategies and underlying vaults are included in the deployment to aid testing and analysis, but are outside the scope of this contest. Yields are mocked and generated on a regular basis. Bots are triggering Harvests any any other actions that are used to maintain the protocol. Mint functionality is open for all stable coins, and users are welcome to use and play around with the protocol. But if you want to do do an extensive amount of interactions with the protocol, such as large trades which may impact the balance of the Curve pool, we would kindly ask you to do so on a fork.

_Call the faucet() method on the stablecoins to claim 10k coins per address._

 The following mocked contracts are used by the protocol on Kovan:
| Mocks                         | Address |
|-------------------------------|------------------------------------------------------|
| DAI	                        | [DAI, '0xcce117e5d7202E8eDAf6B53b261d05a015076708'], |
| USDC	                        | [USDC, '0x12C430321215ceEbb4e6ecCe88d33c142e6A9361'], |
| USDT	                        | [USDT, '0xAEb440dc3F3Be04FF577f9Bd7Cbe31633837F6f1'], |
| Curve3Pool                    | [Curve3Pool, '0x6d2390f4F263c98122A8c671c44e4De89B2B0698'], |
| 3Crv                          | [3Crv, '0xE916940d8bABADE39b709997E16f1cFb4198ad55'], |


The following external contracts are being used
| External                         | Address |
|-------------------------------|------------------------------------------------------|
| DAI/USD Aggregator (Chainlink)| [DAIUSDAggregator, '0x777A68032a88E5A84678A77Af2CD65A7b3c0775a'], |
| USDC/USD Aggregator (Chainlink)| [USDCUSDAggregator, '0x9211c6b3BF41A10F78539810Cf5c64e1BB78Ec60'], |
| USDT/USD Aggregator (Chainlink)| [USDTUSDAggregator, '0x2ca5A90D34cA333661083F89D831f757A9A50148'], |


The following contracts make up the core protocol on Kovan.
| Protocol                         | Address |
|-------------------------------|------------------------------------------------------|
| Controller| [Controller, '0x9C809a3Ae4017F4f9cF515961EB8b09Fc7bc72D6'], |
| DepositHandler| [DepositHandler, '0x4AD396529f0b13d41F8a835D0c1ba84fb2AEd0FB'], |
| WithdrawHandler| [WithdrawHandler, '0x72De5A334b984A0663701275c5ea6D3c14A5a74A'], |
| EmergencyHandler| [EmergencyHandler, '0x857B9417b4e5844522813c22fc855d7610BCA7d5'], |
| NonRebasingGToken| [NonRebasingGToken, '0x5Fd465CCedF3980896E52ad0513a657B3E90974C'], |
| RebasingGToken | [RebasingGToken, '0x6786568A8BD43a878cA5A22296ef42DD2cF9dEf0'], |
| Insurance| [Insurance, '0x4D0137D86558Ad456a8Bc2ab35c3CD4f9C1f1001'], |
| Exposure| [Exposure, '0xA77789742715540E7a9A9f18a0D4075F10A7B448'], |
| Allocation| [Allocation, '0x05B19eAD7732B5383684397D7671860Cd6e418e5'], |
| PnL| [PnL, '0x9E3a37876712EF153BEC27cFa9b9D90648f6940F'], |
| LifeGuard3Pool| [LifeGuard3Pool, '0xB3990791c1790E2c8DB438eE8FEe1461358CEBf8'], |
| Buoy3Pool| [Buoy3Pool, '0x10F939F2C84fb675E7a1F071984aEC8B39bCAECF'], |
| DaiVaultAdapter| [VaultAdaptorYearnV2_032, '0x0b9700a4164F5283242eb10DE73cC23714f5074D'], |
| UsdcVaultAdapter| [VaultAdaptorYearnV2_032, '0x7dB51B13636390bD2F8965a752Ee02654B118846'], |
| UsdtVaultAdapter| [VaultAdaptorYearnV2_032, '0x2FEA3820860b3a3854701df821A0c12102190FB4'], |
| 3CrvVaultAdapter| [VaultAdaptorYearnV2_032, '0xDF7C4E769060eFef607cb91CA0d1cfFC6C42D2dd'], |



