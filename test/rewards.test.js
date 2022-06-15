const { expect, util } = require("chai");
const { ethers } = require("hardhat");
const { utils } = ethers;

describe("AllocationLedger Rewards", () => {
  const depositMax = ethers.utils.parseEther("50000");
  const depositUserMax = ethers.utils.parseEther("10000");
  const depositUserMin = ethers.utils.parseEther("1000");
  // const depositBase = ethers.utils.parseEther("1234.123456789876543214");
  const depositBase = depositUserMin;
  const rewardAmount = ethers.utils.parseEther("100000");
  const baseReward = ethers.utils.parseEther("12500");

  const PAUSE_ACTION_DEPOSIT = utils.keccak256(
    utils.toUtf8Bytes("PAUSE_ACTION_DEPOSIT")
  );
  const PAUSE_ACTION_CLAIM = utils.keccak256(
    utils.toUtf8Bytes("PAUSE_ACTION_CLAIM")
  );

  let creator;
  let account1;
  let account2;
  let account3;
  let account4;
  let account5;

  before(async () => {
    [creator, account1, account2, account3, account4, account5] =
      await ethers.getSigners();

    const deposits = [
      { account: account1, deposit: depositBase, expectedReward: baseReward },
      { account: account2, deposit: depositBase, expectedReward: baseReward },
      // {account: account2, deposit: utils.parseEther("2468.1235012340744"), expectedReward: baseReward},
      {
        account: account3,
        deposit: depositBase.mul(2),
        expectedReward: baseReward.mul(2),
      },
      {
        account: account4,
        deposit: depositBase.mul(4),
        expectedReward: baseReward.mul(4),
      },
    ];

    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    depositToken = await ERC20Mock.deploy(
      [account1, account2, account3, account4].map((entry) => entry.address)
    );
    rewardsToken = await ERC20Mock.deploy([]);

    const AllocationLedger = await ethers.getContractFactory(
      "AllocationLedger"
    );
    ledger = await AllocationLedger.deploy(
      depositToken.address,
      depositMax,
      depositUserMax,
      depositUserMin,
      [account1, account2, account3, account4].map((entry) => entry.address),
      rewardsToken.address
    );
    await ledger.deployed();

    const approveAmount = ethers.utils.parseEther("1000000000");

    [account1, account2, account3, account4].map(async (entry) => {
      await depositToken.connect(entry).approve(ledger.address, approveAmount);
    });

    await rewardsToken.connect(creator).approve(ledger.address, approveAmount);

    deposits.forEach(async (entry) => {
      await ledger.connect(entry.account).deposit(entry.deposit);
    });

    // console.log(await ledger.totalDeposits());
    await ledger.withdrawDeposits(await ledger.totalDeposits(), true);
    await ledger.depositRewards(rewardAmount);
    await ledger.unpauseAction(PAUSE_ACTION_CLAIM);
  });

  it("Should", async () => {
    return;
    const amount = ethers.utils.parseEther("1234.123456789876543214");
    await ledger.connect(account1).deposit(amount);
    await ledger
      .connect(account2)
      .deposit(utils.parseEther("2468.1235012340744"));
    await ledger.connect(account3).deposit(amount.mul(2));
    await ledger.connect(account4).deposit(amount.mul(4));
  });
  it("Should", async () => {
    return;
    const PRECISION = await ledger.PRECISION();
    [account1, account2, account3, account4].map(async (account) => {
      console.log(await ledger.isWhitelisted(account.address));
      console.log(await ledger.deposits(account.address));
      const shares = await ledger.getAccountShare(account.address);
      console.log([shares, shares.div(100), shares.div(PRECISION)]);
      console.log(
        ethers.utils.formatEther(
          await ledger.getAccountRewards(account.address)
        )
      );
    });

    const total = (await ledger.getAccountShare(account1.address))
      .add(await ledger.getAccountShare(account2.address))
      .add(await ledger.getAccountShare(account3.address))
      .add(await ledger.getAccountShare(account4.address));
    console.log([
      "TOTAL",
      [total, rewardAmount, await ledger.totalDeposits()],
      total.div(100),
      total.div(PRECISION),
    ]);

    const total2 = (await ledger.getAccountRewards(account1.address))
      .add(await ledger.getAccountRewards(account2.address))
      .add(await ledger.getAccountRewards(account3.address))
      .add(await ledger.getAccountRewards(account4.address));
    console.log([
      "TOTAL2",
      [total2, rewardAmount, await ledger.totalRewardsDeposited()],
      total2.div(100),
      total2.div(PRECISION),
    ]);
    console.log([PRECISION]);
  });

  it("Should claim", async () => {
    console.log(await ledger.deposits(account1.address));
    console.log(await ledger.getAccountShare(account1.address));
    console.log(await ledger.getAccountRewards(account1.address));
    const oldBalance = await rewardsToken.balanceOf(account1.address);
    console.log(["oldBalance", oldBalance]);
    await ledger.connect(account1).claimRewards();
    const newBalance = await rewardsToken.balanceOf(account1.address);
    console.log(["newBalance", newBalance]);
    console.log([
      await ledger.totalRewardsClaimed(),
      await ledger.claims(account1.address),
      ethers.utils.formatEther(await ledger.claims(account1.address)),
    ]);
  });
});
