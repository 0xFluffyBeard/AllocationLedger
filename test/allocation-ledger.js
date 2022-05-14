const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AllocationLedger", function () {
  const depositLimit = ethers.utils.parseEther("50000");
  const depositUserLimit = ethers.utils.parseEther("10000");

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
    token = await ERC20Mock.deploy(
      [account1, account2, account3, account4].map((entry) => entry.address)
    );

    const AllocationLedger = await ethers.getContractFactory(
      "AllocationLedger"
    );
    ledger = await AllocationLedger.deploy(
      token.address,
      depositLimit,
      depositUserLimit,
      [account1, account2, account3].map((entry) => entry.address)
    );
    await ledger.deployed();

    ledger2 = await AllocationLedger.deploy(token.address, 0, 0, []);
    await ledger2.deployed();

    const approveAmount = ethers.utils.parseEther("1000000");
    await token.connect(account1).approve(ledger2.address, approveAmount);
    await token.connect(account2).approve(ledger2.address, approveAmount);
    await token.connect(account3).approve(ledger2.address, approveAmount);
    await token.connect(account4).approve(ledger2.address, approveAmount);
  });

  describe("Creation", () => {
    it("Should set the token state variable", async () => {
      expect(await ledger.token()).to.equal(token.address);
    });

    it("Should set the limits", async () => {
      expect(await ledger.depositLimit()).to.equal(depositLimit);
      expect(await ledger.depositUserLimit()).to.equal(depositUserLimit);
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
  });

  describe("Management", () => {
    it("Should updagte the limits", async () => {
      const testDepositLimit = ethers.utils.parseEther("60000");
      const testDepositUserLimit = ethers.utils.parseEther("20000");

      await ledger.setLimits(testDepositLimit, testDepositUserLimit);

      expect(await ledger.depositLimit()).to.equal(testDepositLimit);
      expect(await ledger.depositUserLimit()).to.equal(testDepositUserLimit);

      await ledger.setLimits(depositLimit, depositUserLimit);
    });

    it("Should allow only the owner to updagte the limits", async () => {
      await expect(ledger.connect(account1).setLimits(0, 0)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
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

    it("Should pause and unpause the contract", async () => {
      expect(await ledger.paused()).to.be.false;
      await ledger.pause();
      expect(await ledger.paused()).to.be.true;
      await ledger.unpause();
      expect(await ledger.paused()).to.be.false;
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
      const userBalance = await token.balanceOf(user.address);
      const ledger2Balance = await token.balanceOf(ledger2.address);
      const totalDeposits = await ledger2.totalDeposits();
      const amount = ethers.utils.parseEther("1000");

      await expect(ledger2.connect(user).deposit(amount))
        .to.emit(ledger2, "DepositAdded")
        .withArgs(user.address, amount, userDeposit, userDeposit.add(amount));

      expect(await ledger2.getAccountDeposit(user.address)).to.equal(
        userDeposit.add(amount)
      );
      expect(await token.balanceOf(user.address)).to.equal(
        userBalance.sub(amount)
      );
      expect(await token.balanceOf(ledger2.address)).to.equal(
        ledger2Balance.add(amount)
      );
      expect(await ledger2.totalDeposits()).to.equal(totalDeposits.add(amount));
    });

    it("Should fail when paused", async () => {
      await ledger2.pause();

      await expect(
        ledger2.connect(account1).deposit(ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("Pausable: paused");

      await ledger2.unpause();
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

      await ledger2.setLimits(limit, 0);

      await expect(
        ledger2.connect(account1).deposit(limit.add(1))
      ).to.be.revertedWith("Global deposit limit exceded");

      await ledger2.setLimits(0, 0);
    });

    it("Should fail if user limit will be exceded", async () => {
      const limit = ethers.utils.parseEther("10000");

      await ledger2.setLimits(0, limit);

      await expect(
        ledger2.connect(account1).deposit(limit.add(1))
      ).to.be.revertedWith("User deposit limit exceded");

      await ledger2.setLimits(0, 0);
    });
  });

  describe("Withdraw", () => {
    before(async () => {
      const amount = ethers.utils.parseEther("1000");
      await ledger2.connect(account1).deposit(amount);
      await ledger2.connect(account2).deposit(amount);
      await ledger2.connect(account3).deposit(amount);
    });

    it("Should withdraw tokens to the caller", async () => {
      const ownerBalance = await token.balanceOf(creator.address);
      const ledger2Balance = await token.balanceOf(ledger2.address);
      const totalDeposits = await ledger2.totalDeposits();
      const amount = ethers.utils.parseEther("1000");

      await expect(ledger2.withdraw(amount, false))
        .to.emit(ledger2, "Withdrawn")
        .withArgs(creator.address);

      expect(await token.balanceOf(creator.address)).to.equal(
        ownerBalance.add(amount)
      );
      expect(await token.balanceOf(ledger2.address)).to.equal(
        ledger2Balance.sub(amount)
      );
      expect(await ledger2.totalDeposits()).to.equal(totalDeposits);

      expect(await ledger2.paused()).to.be.false;
    });

    it("Should pause the contract after withdrawal", async () => {
      const amount = ethers.utils.parseEther("1000");
      await expect(ledger2.withdraw(amount, true))
        .to.emit(ledger2, "Withdrawn")
        .withArgs(creator.address);

      expect(await ledger2.paused()).to.be.true;
    });

    it("Should allow only the owner to withdraw", async () => {
      await expect(
        ledger2.connect(account1).withdraw(0, false)
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
