import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User, Artwork, Nft, Wallet,
  NftData,
  Collection,
  NftId
} from '../entities';
import { NftInterface } from '@modules/nft-module/query_metadata/interface/NftInterface';
import { CollectionInterface } from '@modules/nft-module/query_metadata/interface/ColInterface';
import { AppConfigService } from '@modules/config/app-config.service';
import { AdminRepository } from './admin.repository';

@Injectable()
export class NftRepository {

  private readonly logger = new Logger(NftRepository.name)

  constructor(
    private appConfig: AppConfigService,
    private adminRepository: AdminRepository,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Nft) private nfts: Repository<Nft>,
    @InjectRepository(Wallet) private wallets: Repository<Wallet>,
    @InjectRepository(Artwork) private artworks: Repository<Artwork>,
    @InjectRepository(Collection) private collections: Repository<Collection>,
  ) { }

  //Returns user from database
  async getUser(userId: string) {
    return this.users.findOneBy({ id: userId });
  }

  //Returns user associated wallets
  async getUserWallets(userId: string) {
    return this.wallets.find({
      relations: {
        user: true,
      },
      where: { user: { id: userId } }
    });
  }

  //Returns all NFTs associated with a wallet address
  async getWalletNFTs(walletAddress: string) {
    return this.nfts.find({
      relations: {
        wallet: true,
      },
      where: { wallet: { walletAddress: walletAddress } }
    });
  }

  //Returns boolean if NFT is an artwork
  async isArtworkNFT(artworkId: string): Promise<boolean> {
    const art = await this.artworks.findOneBy({ id: artworkId });
    return (art != null && art.nftId != null);
  }

  //Assigns NFT to specific artwork
  async artworkNFT(nft: Nft, artworkId: string) {
    return this.artworks.update(artworkId, { nft: nft });
  }

  //Returns NFT metadata
  async getNFTMetadata(nftId: string) {
    const nft = await this.nfts.findOneBy({ id: nftId });
    return nft?.nftData
  }

  async getNFT(nftId: string) {
    return this.nfts.findOneBy({ id: nftId });
  }

  //Returns Collection metadata
  async getColMetadata(colId: string) {
    const col = await this.collections.findOneBy({ id: colId });
    return col?.colData
  }

  async getCol(colId: string) {
    return this.collections.findOneBy({ id: colId });
  }

  async updateNFT(nftId: string, nftData: NftData) {
    const nft = await this.nfts.findOneBy({ id: nftId });
    nft.nftData = nftData;
    return this.nfts.save(nft);
  }

  async getWallet(walletAddress: string): Promise<Wallet | null> {
    return this.wallets.findOne({
      relations: {
        collections: { nfts: { artwork: true } },
        nfts: { artwork: true },
      },
      where: {
        walletAddress: walletAddress
      }
    });
  }

  //Removes NFT
  async removeNFT(nftId: string) {

    return this.nfts.remove(this.nfts.create({ id: nftId }))
  }

  //Creates NFT
  async createNFT(nft_data: NftData, walletId: string, artworkId: string) {
    const wallet = await this.wallets.findOneBy({ id: walletId });
    const artwork = await this.artworks.findOneBy({ id: artworkId });
    const nft = new Nft();
    nft.artwork = artwork;
    nft.wallet = wallet;
    nft.nftData = nft_data;
    nft.onlineCheck = this.appConfig.kodadotUrl + "/gallery/" + nft_data.id;
    //Also add nft under collection if it's associated with one
    const cols = await this.getWalletCols(wallet.walletAddress);

    const nftId = nft.nftData.id;
    //Split ids
    const nftIdArr = nftId.split("-");

    //check if any collections are associated with this NFT
    if (cols != null) {
      for (const col of cols) {
        if (col.colData != null) {
          const colId = col.colData.id;

          //Compare to check if nft is associated with this collection
          if (nftIdArr[0] == colId) {
            nft.collection = col;
            break;
          }
        }
      }
    }

    return this.nfts.save(nft);
  }

  //Assign wallet to user - User can have multiple wallets
  async assignWallet(wallet: Wallet, userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    wallet.user = user;

    return this.wallets.save(wallet);
  }

  //Changes the owner of NFT in database
  async changeOwner(nft: NftId, walletAddress: string) {
    const wallet = await this.wallets.findOneBy({ walletAddress: walletAddress });
    const nftDB = await this.nfts.findOneBy({ id: nft });
    nftDB.wallet = wallet;

    return this.nfts.save(nftDB);
  }

  //Changes trialmint status to true
  async claimTrialMint(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    user.trialMintClaimed = true;
    await this.users.save(user);
  }

  //Get user associated with wallet
  async getUserByWallet(walletAddress: string) {
    const wallet = await this.wallets.findOne({
      where: { walletAddress },
      relations: ['user'],  // Include the 'user' relation
    });

    return wallet?.user;
  }


  //Get user associated with wallet
  async getUserByWalletTrial(walletAddress: string) {
    const wallet = await this.wallets.findOne({
      where: { walletAddress },
      relations: ['user'],  // Include the 'user' relation
    });

    const user = await this.users.findOne({
      where: { id: wallet.user.id },
      relations: ['trialMint'],  // Include the 'user' relation
    });
    return user; // Return the user from the wallet
  }

  //Mints NFT for user as trial mint by Eva Gallery wallet
  async trialMint(userId: string, artworkId: string, nft: NftData, EvaGalleryWallet: string) {
    const user = await this.users.findOneBy({ id: userId });
    const wallet = await this.wallets.findOneBy({ walletAddress: EvaGalleryWallet });
    const savedNFT = await this.createNFT(nft, wallet.id, artworkId);
    user.trialMint = savedNFT;
    await this.users.save(user);
  }

  async payTrialMint(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    user.trialMintPaid = true;
    await this.users.save(user);
  }

  async getArtwork(userId: string, artworkId: string) {
    // Include userId condition directly in the findOneBy query
    const artwork = await this.artworks.findOne({
      where: {
        id: artworkId,
        artist: {
          user: {
            id: userId,
          },
        },
      },
      // Load all required related entities
      relations: ['artist', 'artist.user'],
    });
    return artwork;
  }

  //Returns trial minted NFT id
  async getTrialMinted(userId: string) {
    const user = await this.users.findOneBy({ id: userId });
    return user.trialMint;
  }

  /// Retrieves all collections associated with a wallet
  async getWalletCols(walletAddress: string) {
    return this.collections.find({
      relations: {
        wallet: true,
      },
      where: { wallet: { walletAddress: walletAddress } }
    });
  }

  async ensureWallet(walletAddress: string, userId?: string) {
    const wallet = await this.wallets.findOneBy({ walletAddress: walletAddress });
    if (wallet == null) {
      const newWallet = new Wallet();
      newWallet.walletAddress = walletAddress;
      newWallet.onlineCheck = this.appConfig.subscanUrl + "/account/" + walletAddress;
      if (userId != null) {
        newWallet.user = await this.users.findOneBy({ id: userId });
      }
      return this.wallets.save(newWallet);
    }
    return wallet
  }


  /// Assigns metadata that was queried from API
  async assignNFTsMetadata(userId: string, walletAddress: string, nfts: NftInterface[]) {
    // Create new Wallet in DB if it doesn't exist
    let wallet = await this.wallets.findOneBy({ walletAddress: walletAddress });
    let cols;
    if (wallet == null) {
      const newWallet = new Wallet();
      newWallet.walletAddress = walletAddress;
      newWallet.user = await this.users.findOneBy({ id: userId });
      newWallet.onlineCheck = this.appConfig.subscanUrl + "/account/" + walletAddress;
      await this.wallets.save(newWallet);
      wallet = newWallet;
    }
    else {
      //If wallet already exists query collections also
      cols = await this.getWalletCols(walletAddress);
    }

    // Initialize nfts array if it's not already initialized
    if (wallet.nfts == null) {
      wallet.nfts = [];
    }

    for (const nftData of nfts) {
      const { id, name, image, metadata = null } = nftData;

      // Create a new NFT instance
      const nft = new Nft();
      nft.nftData = {
        id,
        name,
        description: metadata,
        image,
      };
      nft.onlineCheck = this.appConfig.kodadotUrl + "/gallery/" + id;
      nft.wallet = wallet;

      //Parse nft id to check if it's associated with this collection
      //Example of nft id - "u421-10" or "421-10" where u specifies nfts created by unique pallet, entries without u are created by nfts pallet
      //Example of col id - "u421" or "421"
      const nftId = nft.nftData.id;
      //Split ids
      const nftIdArr = nftId.split("-");

      //check if any collections are associated with this NFT
      if (cols != null) {
        for (const col of cols) {
          if (col.colData != null) {
            const colId = col.colData.id;

            //Compare to check if nft is associated with this collection
            if (nftIdArr[0] == colId) {
              nft.collection = col;
              break;
            }
          }
        }
      }

      if (nft.collection == null) {
        this.logger.log(`NFT with id ${id} doesnt belong to any collection in the database`)
      }

      const existingNft = await this.nfts.createQueryBuilder("nft")
        .where("nft.nftData ->> 'id' = :id", { id: nft.nftData.id })
        .getOne();

      if (existingNft != null) {
        this.logger.log(`NFT with id ${id} already exists in the database`);
      } else {
        // Save the NFT to the database and associate it with the wallet
        wallet.nfts.push(nft); // Push the NFT to the wallet's nfts array
        await this.nfts.save(nft); // Save the NFT to the database  
      }

    }
  }

  /// Assigns metadata that was queried from API
  async assignColsMetadata(userId: string, walletAddress: string, cols: CollectionInterface[]) {

    // Create new Wallet in DB if it doesn't exist 
    let wallet = await this.wallets.findOneBy({ walletAddress: walletAddress });
    if (wallet == null) {
      const newWallet = new Wallet();
      newWallet.walletAddress = walletAddress;
      newWallet.user = await this.users.findOneBy({ id: userId });
      newWallet.onlineCheck = this.appConfig.subscanUrl + "/account/" + walletAddress;
      await this.wallets.save(newWallet);
      wallet = newWallet;
    }

    // Initialize nfts array if it's not already initialized
    if (wallet.collections == null) {
      wallet.collections = [];
    }

    for (const colData of cols) {
      const { id, name, image, metadata = null } = colData;

      // Create a new Col instance
      const col = new Collection();
      col.colData = {
        id,
        name,
        description: metadata,
        image,
      };

      col.onlineCheck = this.appConfig.kodadotUrl + "/collection/" + id;
      col.wallet = wallet;

      const existingCol = await this.collections.createQueryBuilder("collection")
        .where("collection.colData ->> 'id' = :id", { id: col.colData.id })
        .getOne();

      if (existingCol != null) {
        this.logger.log(`Collection with id ${id} already exists in the database`);
      }
      else {
        // Save the NFT to the database and associate it with the wallet
        wallet.collections.push(col); // Push the NFT to the wallet's nfts array
        await this.collections.save(col); // Save the NFT to the database  
      }
    }
  }
}
