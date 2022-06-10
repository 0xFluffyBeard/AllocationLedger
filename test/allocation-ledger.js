const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils } = ethers;

describe("AllocationLedger", function () {
  const depositMax = ethers.utils.parseEther("50000");
  const depositUserMax = ethers.utils.parseEther("10000");
  const depositUserMin = ethers.utils.parseEther("1000");

  const PAUSE_ACTION_DEPOSIT = utils.keccak256(utils.toUtf8Bytes("PAUSE_ACTION_DEPOSIT"));
  const PAUSE_ACTION_WITHDRAW = utils.keccak256(utils.toUtf8Bytes("PAUSE_ACTION_WITHDRAW"));

  let creator;
  let account1;
  let account2;
  let account3;
  let account4;
  let account5;

  before(async () => {
    [creator, account1, account2, account3, account4, account5] =
      await ethers.getSigners();

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
      [account1, account2, account3].map((entry) => entry.address),
      rewardsToken.address
    );
    await ledger.deployed();

    ledger2 = await AllocationLedger.deploy(depositToken.address, 0, 0, 0, [], rewardsToken.address);
    await ledger2.deployed();

    const approveAmount = ethers.utils.parseEther("1000000");
    await depositToken.connect(account1).approve(ledger2.address, approveAmount);
    await depositToken.connect(account2).approve(ledger2.address, approveAmount);
    await depositToken.connect(account3).approve(ledger2.address, approveAmount);
    await depositToken.connect(account4).approve(ledger2.address, approveAmount);
  });

  describe("Creation", () => {
    it("Should set the deposit token state variable", async () => {
      expect(await ledger.depositToken()).to.equal(depositToken.address);
    });

    it("Should set the limits", async () => {
      expect(await ledger.depositMax()).to.equal(depositMax);
      expect(await ledger.depositUserMax()).to.equal(depositUserMax);
    });

    it("Should whitelist the accounts from constructor", async () => {
      expect(await ledger.isWhitelisted(account1.address)).to.be.true;
      expect(await ledger.isWhitelisted(account2.address)).to.be.true;
      expect(await ledger.isWhitelisted(account3.address)).to.be.true;
    });

    it("Should not whitelist other accounts", async () => {
      expect(await ledger.isWhitelisted(account4.address)).to.be.false;
      expect(await ledger.isWhitelisted(account5.address)).to.be.false;
    });

    it("Should set the rewards token state variable", async () => {
      expect(await ledger.rewardsToken()).to.equal(rewardsToken.address);
    });
  });

  describe("Management", () => {
    it("Should updagte the limits", async () => {
      const testdepositMax = ethers.utils.parseEther("60000");
      const testdepositUserMax = ethers.utils.parseEther("20000");
      const testdepositUserMin = ethers.utils.parseEther("10000");

      await ledger.setLimits(
        testdepositMax,
        testdepositUserMax,
        testdepositUserMin
      );

      expect(await ledger.depositMax()).to.equal(testdepositMax);
      expect(await ledger.depositUserMax()).to.equal(testdepositUserMax);
      expect(await ledger.depositUserMin()).to.equal(testdepositUserMin);

      await ledger.setLimits(depositMax, depositUserMax, depositUserMin);
    });

    it("Should allow only the owner to updagte the limits", async () => {
      await expect(
        ledger.connect(account1).setLimits(0, 0, 0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should add to the whitelist and emit an event", async () => {
      expect(await ledger.isWhitelisted(account4.address)).to.be.false;

      await expect(ledger.addToWhitelist([account4.address]))
        .to.emit(ledger, "WhitelistEntryAdded")
        .withArgs(account4.address);

      expect(await ledger.isWhitelisted(account4.address)).to.be.true;
    });

    it("Should remove from the whitelist and emit an event", async () => {
      expect(await ledger.isWhitelisted(account3.address)).to.be.true;
      expect(await ledger.isWhitelisted(account4.address)).to.be.true;

      await expect(ledger.removeFromWhitelist([account3.address]))
        .to.emit(ledger, "WhitelistEntryRemoved")
        .withArgs(account3.address);
      await expect(ledger.removeFromWhitelist([account4.address]))
        .to.emit(ledger, "WhitelistEntryRemoved")
        .withArgs(account4.address);

      expect(await ledger.isWhitelisted(account3.address)).to.be.false;
      expect(await ledger.isWhitelisted(account4.address)).to.be.false;
    });

    it("Should allow only the owner to manage the whitelist", async () => {
      await expect(
        ledger.connect(account1).addToWhitelist([])
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(
        ledger.connect(account1).removeFromWhitelist([])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should pause and unpause the default action", async () => {
      expect(await ledger.paused()).to.be.false;
      await ledger.pause();
      expect(await ledger.paused()).to.be.true;
      await ledger.unpause();
      expect(await ledger.paused()).to.be.false;
    });

    it("Should pause and unpause an action", async () => {
      const PAUSE_ACTION_CUSTOM = ethers.utils.formatBytes32String("PAUSE_ACTION_CUSTOM");
      expect(await ledger.pausedAction(PAUSE_ACTION_CUSTOM)).to.be.false;
      await ledger.pauseAction(PAUSE_ACTION_CUSTOM);
      expect(await ledger.pausedAction(PAUSE_ACTION_CUSTOM)).to.be.true;
      await ledger.unpauseAction(PAUSE_ACTION_CUSTOM);
      expect(await ledger.pausedAction(PAUSE_ACTION_CUSTOM)).to.be.false;
    });

    it("Should allow only the owner to manage the paused state", async () => {
      await expect(ledger.connect(account1).pause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      await expect(ledger.connect(account1).unpause()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Should not allow to renounce the ownership", async () => {
      await expect(ledger.renounceOwnership()).to.be.revertedWith(
        "Renounce not allowed"
      );
    });
  });

  describe("Deposit", () => {
    it("Should deposit ERC20 to the contract's ballance", async () => {
      const user = account1;
      const userDeposit = await ledger2.getAccountDeposit(user.address);
      const userBalance = await depositToken.balanceOf(user.address);
      const ledger2Balance = await depositToken.balanceOf(ledger2.address);
      const totalDeposits = await ledger2.totalDeposits();
      const amount = ethers.utils.parseEther("1000");

      await expect(ledger2.connect(user).deposit(amount))
        .to.emit(ledger2, "DepositAdded")
        .withArgs(user.address, amount, userDeposit, userDeposit.add(amount));

      expect(await ledger2.getAccountDeposit(user.address)).to.equal(
        userDeposit.add(amount)
      );
      expect(await depositToken.balanceOf(user.address)).to.equal(
        userBalance.sub(amount)
      );
      expect(await depositToken.balanceOf(ledger2.address)).to.equal(
        ledger2Balance.add(amount)
      );
      expect(await ledger2.totalDeposits()).to.equal(totalDeposits.add(amount));
    });

    it("Should fail when paused", async () => {
      await ledger2.pauseAction(PAUSE_ACTION_DEPOSIT);

      await expect(
        ledger2.connect(account1).deposit(ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("Pausable: paused");

      await ledger2.unpauseAction(PAUSE_ACTION_DEPOSIT);
    });

    it("Should allow diposits to whitelisted users but fail for others", async () => {
      const whitelistedAccount = account2;
      const notWhitelistedAccount = account3;

      const amount = ethers.utils.parseEther("1000");

      await ledger2.addToWhitelist([whitelistedAccount.address]);

      await expect(ledger2.connect(whitelistedAccount).deposit(amount)).to.emit(
        ledger2,
        "DepositAdded"
      );
      await expect(
        ledger2.connect(notWhitelistedAccount).deposit(amount)
      ).to.be.revertedWith("Account not whitelisted");

      await ledger2.removeFromWhitelist([whitelistedAccount.address]);
    });

    it("Should fail if global limit will be exceded", async () => {
      const limit = ethers.utils.parseEther("10000");

      await ledger2.setLimits(limit, 0, 0);

      await expect(
        ledger2.connect(account1).deposit(limit.add(1))
      ).to.be.revertedWith("Global deposit limit exceded");

      await ledger2.setLimits(0, 0, 0);
    });

    it("Should fail if user max limit will be exceded", async () => {
      const limit = ethers.utils.parseEther("1000");

      await ledger2.setLimits(0, limit, 0);

      await expect(
        ledger2.connect(account1).deposit(limit.add(1))
      ).to.be.revertedWith("User max deposit limit exceded");

      await ledger2.setLimits(0, 0, 0);
    });

    it("Should fail if user min limit not reached", async () => {
      const limit = ethers.utils.parseEther("1000");

      await ledger2.setLimits(0, 0, limit);

      await expect(
        ledger2.connect(account5).deposit(limit.sub(100))
      ).to.be.revertedWith("User min deposit not reached");

      await ledger2.setLimits(0, 0, 0);
    });
  });

  describe("Withdraw", () => {
    before(async () => {
      const amount = ethers.utils.parseEther("1000");
      await ledger2.connect(account1).deposit(amount);
      await ledger2.connect(account2).deposit(amount);
      await ledger2.connect(account3).deposit(amount);
    });

    it("Should withdraw deposited tokens to the caller", async () => {
      const ownerBalance = await depositToken.balanceOf(creator.address);
      const ledger2Balance = await depositToken.balanceOf(ledger2.address);
      const totalDeposits = await ledger2.totalDeposits();
      const amount = ethers.utils.parseEther("1000");

      await expect(ledger2.withdrawDeposits(amount, false))
        .to.emit(ledger2, "Withdrawn")
        .withArgs(creator.address, amount);

      expect(await depositToken.balanceOf(creator.address)).to.equal(
        ownerBalance.add(amount)
      );
      expect(await depositToken.balanceOf(ledger2.address)).to.equal(
        ledger2Balance.sub(amount)
      );
      expect(await ledger2.totalDeposits()).to.equal(totalDeposits);

      expect(await ledger2.pausedAction(PAUSE_ACTION_DEPOSIT)).to.be.false;
    });

    it("Should pause the contract after withdrawal", async () => {
      const amount = ethers.utils.parseEther("1000");
      await expect(ledger2.withdrawDeposits(amount, true))
        .to.emit(ledger2, "Withdrawn")
        .withArgs(creator.address, amount);

      expect(await ledger2.pausedAction(PAUSE_ACTION_DEPOSIT)).to.be.true;
    });

    it("Should allow only the owner to withdraw", async () => {
      await expect(
        ledger2.connect(account1).withdrawDeposits(0, false)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  it("Should calculate the user's share", async () => {
    const user = account1;
    const amount = ethers.utils.parseEther("1000");

    await ledger2.connect(user).deposit(amount);
    await ledger2.connect(account2).deposit(amount);
    await ledger2.connect(account3).deposit(amount);

    const totalDeposits = await ledger2.totalDeposits();
    const userDeposit = await ledger2.getAccountDeposit(user.address);

    expect(await ledger2.getAccountShare(user.address)).to.equal(
      userDeposit.mul(100).div(totalDeposits)
    );
  });
});
