import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155MixedFungible, InterfaceCheck } from '../typechain';

describe('ERC1155MixedFungible - Unit Tests', () => {
  const baseUri = 'https://firefly/{id}';
  const fungibleTokenTypeId = BigInt('0x100000000000000000000000000000000');
  const nonFungibleTokenTypeId = BigInt(
    '0x8000000000000000000000000000000100000000000000000000000000000000',
  );
  const nonFungibleTokenId = BigInt(
    '0x8000000000000000000000000000000100000000000000000000000000000001',
  );
  const poolSize = BigInt(1) << BigInt(128);

  const ONE_ADDRESS = '0x1111111111111111111111111111111111111111';

  let deployedERC1155: ERC1155MixedFungible;
  let deployerSignerA: SignerWithAddress;
  let signerB: SignerWithAddress;
  let signerC: SignerWithAddress;

  beforeEach(async () => {
    [deployerSignerA, signerB, signerC] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory('ERC1155MixedFungible');
    deployedERC1155 = await Factory.connect(deployerSignerA).deploy(baseUri);
    await deployedERC1155.deployed();
  });

  it('Verify interface ID', async () => {
    const checkerFactory = await ethers.getContractFactory('InterfaceCheck');
    const checker: InterfaceCheck = await checkerFactory.connect(deployerSignerA).deploy();
    expect(await checker.erc1155WithUri()).to.equal('0xa1d87d57');
  });

  it('Deploy - should deploy a new ERC1155 instance with the default uri', async () => {
    expect(await deployedERC1155.uri(1)).to.equal(baseUri);
  });

  context('Create function', () => {
    it('should support deployment of a new fungible token pool without data', async () => {
      await expect(deployedERC1155.connect(deployerSignerA).create(true, '0x00'))
        .to.emit(deployedERC1155, 'TokenPoolCreation')
        .withArgs(
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          true,
          fungibleTokenTypeId,
          fungibleTokenTypeId,
          '0x00',
        );
    });
    it('should support deployment of a new non-fungible token pool without data', async () => {
      await expect(deployedERC1155.connect(deployerSignerA).create(false, '0x00'))
        .to.emit(deployedERC1155, 'TokenPoolCreation')
        .withArgs(
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          false,
          nonFungibleTokenTypeId,
          nonFungibleTokenTypeId + poolSize - BigInt(1),
          '0x00',
        );
    });
  });

  context('Mint function', () => {
    context('for non-fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(false, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            false,
            nonFungibleTokenTypeId,
            nonFungibleTokenTypeId + poolSize - BigInt(1),
            '0x00',
          );
      });
      it('signer should be able to mint their own tokens', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintNonFungible(nonFungibleTokenTypeId, [deployerSignerA.address], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');
      });

      it('signer should be able to mint their own tokens with custom URI', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintNonFungibleWithURI(
              nonFungibleTokenTypeId,
              [deployerSignerA.address],
              '0x00',
              'testURI',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(await deployedERC1155.uri(nonFungibleTokenId)).to.equal('testURI');
      });
    });
    context('for fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(true, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            true,
            fungibleTokenTypeId,
            fungibleTokenTypeId,
            '0x00',
          );
      });
      it('signer should be able to mint their own tokens', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintFungible(fungibleTokenTypeId, [deployerSignerA.address], [100], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
      });

      it('non-deployer of contract should not be able to mint tokens', async function () {
        expect(await deployedERC1155.balanceOf(signerB.address, fungibleTokenTypeId)).to.equal(0);
        // Signer B mint to Signer B (Not allowed)
        await expect(
          deployedERC1155
            .connect(signerB)
            .mintFungible(fungibleTokenTypeId, [signerB.address], [100], '0x00'),
        ).to.be.reverted;

        expect(await deployedERC1155.balanceOf(signerB.address, fungibleTokenTypeId)).to.equal(0);
      });

      it('non-signing address should not be able to mint tokens', async function () {
        expect(await deployedERC1155.balanceOf(ONE_ADDRESS, fungibleTokenTypeId)).to.equal(0);
        // Non-signer mint to non-signer (Not allowed)
        await expect(
          deployedERC1155
            .connect(ONE_ADDRESS)
            .mintFungible(fungibleTokenTypeId, [ONE_ADDRESS], [100], '0x00'),
        ).to.be.reverted;
        expect(await deployedERC1155.balanceOf(ONE_ADDRESS, fungibleTokenTypeId)).to.equal(0);
      });
    });
  });

  context('Transfer function', () => {
    context('for non-fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(false, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            false,
            nonFungibleTokenTypeId,
            nonFungibleTokenTypeId + poolSize - BigInt(1),
            '0x00',
          );
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintNonFungible(nonFungibleTokenTypeId, [deployerSignerA.address], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(1);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, nonFungibleTokenId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, nonFungibleTokenId),
        ).to.equal(0);
      });

      it('signer should be able to transfer their token to another signer', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .safeTransferFrom(
              deployerSignerA.address,
              signerB.address,
              nonFungibleTokenId,
              1,
              '0x00',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, nonFungibleTokenId),
        ).to.equal(1);
      });

      it('signer should be able to transfer approved token on behalf of another signer', async () => {
        await expect(
          deployedERC1155.connect(deployerSignerA).setApprovalForAll(signerB.address, true),
        ).to.emit(deployedERC1155, 'ApprovalForAll');
        await expect(
          deployedERC1155
            .connect(signerB)
            .safeTransferFrom(
              deployerSignerA.address,
              signerC.address,
              nonFungibleTokenId,
              1,
              '0x00',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, nonFungibleTokenId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, nonFungibleTokenId),
        ).to.equal(1);
      });

      it('signer should not be able to transfer token on behalf of another signer without approval', async () => {
        await expect(
          deployedERC1155
            .connect(signerB)
            .safeTransferFrom(
              deployerSignerA.address,
              signerC.address,
              nonFungibleTokenId,
              1,
              '0x00',
            ),
        ).to.be.revertedWith('ERC1155: caller is not owner nor approve');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(1);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, nonFungibleTokenId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, nonFungibleTokenId),
        ).to.equal(0);
      });
    });

    context('for fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(true, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            true,
            fungibleTokenTypeId,
            fungibleTokenTypeId,
            '0x00',
          );
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintFungible(fungibleTokenTypeId, [deployerSignerA.address], [100], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, fungibleTokenTypeId),
        ).to.equal(0);
      });

      it('signer should be able to transfer their token to another signer', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .safeTransferFrom(
              deployerSignerA.address,
              signerB.address,
              fungibleTokenTypeId,
              20,
              '0x00',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(80);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(20);
      });

      it('signer should be able to transfer approved token on behalf of another signer', async () => {
        await expect(
          deployedERC1155.connect(deployerSignerA).setApprovalForAll(signerB.address, true),
        ).to.emit(deployedERC1155, 'ApprovalForAll');
        await expect(
          deployedERC1155
            .connect(signerB)
            .safeTransferFrom(
              deployerSignerA.address,
              signerC.address,
              fungibleTokenTypeId,
              30,
              '0x00',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        await expect(
          deployedERC1155
            .connect(signerB)
            .safeTransferFrom(
              deployerSignerA.address,
              signerB.address,
              fungibleTokenTypeId,
              20,
              '0x00',
            ),
        ).to.emit(deployedERC1155, 'TransferSingle');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(50);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(20);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, fungibleTokenTypeId),
        ).to.equal(30);
      });

      it('signer should not be able to transfer token on behalf of another signer without approval', async () => {
        await expect(
          deployedERC1155
            .connect(signerB)
            .safeTransferFrom(
              deployerSignerA.address,
              signerC.address,
              fungibleTokenTypeId,
              1,
              '0x00',
            ),
        ).to.be.revertedWith('ERC1155: caller is not owner nor approve');
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(0);
        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerC.address, fungibleTokenTypeId),
        ).to.equal(0);
      });
    });
  });

  context('Burn function', () => {
    context('for non-fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(false, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            false,
            nonFungibleTokenTypeId,
            nonFungibleTokenTypeId + poolSize - BigInt(1),
            '0x00',
          );
      });
      it('signer should be able to burn their own tokens', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintNonFungible(nonFungibleTokenTypeId, [deployerSignerA.address], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(1);

        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .burn(deployerSignerA.address, nonFungibleTokenId, 1, '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(0);
      });

      it('signer should be able to burn more than 1 token', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintNonFungible(nonFungibleTokenTypeId, [deployerSignerA.address], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        const tokenId = BigInt(
          '57896044618658097711785492504343953926975274699741220483192166611388333031425',
        );
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .burn(deployerSignerA.address, tokenId, 2, '0x00'),
        ).to.be.reverted;

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, nonFungibleTokenId),
        ).to.equal(1);
      });
    });
    context('for fungible tokens', () => {
      beforeEach(async () => {
        await expect(deployedERC1155.connect(deployerSignerA).create(true, '0x00'))
          .to.emit(deployedERC1155, 'TokenPoolCreation')
          .withArgs(
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            true,
            fungibleTokenTypeId,
            fungibleTokenTypeId,
            '0x00',
          );
      });
      it('signer should be able to burn their own tokens', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintFungible(fungibleTokenTypeId, [deployerSignerA.address], [100], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .burn(deployerSignerA.address, fungibleTokenTypeId, 70, '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(30);
      });

      it('signer should be able to burn more tokens than they own', async () => {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintFungible(fungibleTokenTypeId, [deployerSignerA.address], [100], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .burn(deployerSignerA.address, fungibleTokenTypeId, 110, '0x00'),
        ).to.be.reverted;

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(deployerSignerA.address, fungibleTokenTypeId),
        ).to.equal(100);
      });

      it('signer should not be able to burn tokens owned by others', async function () {
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .mintFungible(fungibleTokenTypeId, [signerB.address], [100], '0x00'),
        ).to.emit(deployedERC1155, 'TransferSingle');

        expect(
          await deployedERC1155
            .connect(deployerSignerA)
            .balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(100);
        await expect(
          deployedERC1155
            .connect(deployerSignerA)
            .burn(signerB.address, fungibleTokenTypeId, 70, '0x00'),
        ).to.be.reverted;

        expect(
          await deployedERC1155.connect(signerB).balanceOf(signerB.address, fungibleTokenTypeId),
        ).to.equal(100);
      });
    });
  });
});
