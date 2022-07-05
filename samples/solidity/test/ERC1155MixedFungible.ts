import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { ERC1155MixedFungible, InterfaceCheck } from '../typechain';

describe ('ERC1155MixedFungible - Unit Tests', function () {
  const baseUri = 'https://firefly/{id}';

  let Factory;
  let deployedERC1155: ERC1155MixedFungible;
  let deployerSignerA: SignerWithAddress;

  beforeEach(async () => {
    [deployerSignerA] = await ethers.getSigners();

    Factory = await ethers.getContractFactory('ERC1155MixedFungible');
    deployedERC1155 = await Factory.connect(deployerSignerA).deploy(
      baseUri
    );
    await deployedERC1155.deployed();
  });

  it('Verify interface ID', async function () {
    const checkerFactory = await ethers.getContractFactory('InterfaceCheck');
    const checker: InterfaceCheck = await checkerFactory.connect(deployerSignerA).deploy();
    expect(await checker.erc1155WithUri()).to.equal('0xa1d87d57');
  })

  it('Deploy - should deploy a new ERC1155 instance with the default uri', async function () {
    expect(await deployedERC1155.uri(1)).to.equal(baseUri);   
  });

  it('Create - should deploy a new fungible token pool without data', async function () {
    await expect(
      deployedERC1155.connect(deployerSignerA).create(true, "0x00"),
    )
      .to.emit(deployedERC1155, "TokenPoolCreation");
  });

  it('Create - should deploy a new non-fungible token pool without data', async function () {
    await expect(
      deployedERC1155.connect(deployerSignerA).create(false, "0x00"),
    )
      .to.emit(deployedERC1155, "TokenPoolCreation").withArgs("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", BigInt("57896044618658097711785492504343953926975274699741220483192166611388333031424"), "0x00");
  });

  it('Mint - Signer should mint their own non-fungible tokens', async function () {
    const typeId = BigInt("57896044618658097711785492504343953926975274699741220483192166611388333031424");

    await expect(
      deployedERC1155.connect(deployerSignerA).create(false, "0x00"),
    )
      .to.emit(deployedERC1155, "TokenPoolCreation").withArgs("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", typeId, "0x00");

    await expect(
      deployedERC1155.connect(deployerSignerA).mintNonFungible(typeId, [deployerSignerA.address], "0x00")
    ).to.emit(deployedERC1155, "TransferSingle");
  });

  it('Mint - Signer should mint their own non-fungible tokens with custom URI', async function () {
    const typeId = BigInt("57896044618658097711785492504343953926975274699741220483192166611388333031424");

    await expect(
      deployedERC1155.connect(deployerSignerA).create(false, "0x00"),
    )
      .to.emit(deployedERC1155, "TokenPoolCreation").withArgs("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", typeId, "0x00");

    await expect(
      deployedERC1155.connect(deployerSignerA).mintNonFungibleWithURI(typeId, [deployerSignerA.address], "0x00", "testURI")
    ).to.emit(deployedERC1155, "TransferSingle");

    const tokenId = BigInt("57896044618658097711785492504343953926975274699741220483192166611388333031425");

    expect(await deployedERC1155.uri(tokenId)).to.equal("testURI");   
  });

});