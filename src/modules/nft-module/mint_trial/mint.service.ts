import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '@common/config';
import { AdminRepository, NftRepository } from '@modules/app-db/repositories';
import { NftData } from '@modules/app-db/entities';
import { convertIpfsLink } from '@common/helpers';

export enum MintStatus {
  MintedAlready = 'MintedAlready',
  Success = 'Success',
  Failed = 'Failed'
}

@Injectable()
export class MintCreator {
  constructor(private configService: ConfigService<AppConfig>, private nftRepository: NftRepository, private adminRepository: AdminRepository) {

  }

  async createMint(userId: string, artworkId: string): Promise<MintStatus> {
    //First we check if user has the right to mint an NFT, if they have already minted an NFT we return null
    //If they haven't we create the NFT for them
    const user = await this.nftRepository.getUser(userId);
    const artwork = await this.nftRepository.getArtwork(userId, artworkId);
    const artworkImage = await this.adminRepository.getArtworkImage(userId, artworkId);


    if (artwork == null || user.trialMintClaimed == true || user.trialMintId != null) {
      return MintStatus.MintedAlready;
    }

    const url = this.configService.get("NFT_MODULE_URL");

    //Create metadata
    const descriptionParts = [
      artwork.description ? `Description: ${artwork.description}` : null,
      artwork.artist?.name ? `Artist: ${artwork.artist.name}` : null,
      artwork.year ? `Year: ${artwork.year}` : null,
      artwork.artworkGenre?.name ? `Genre: ${artwork.artworkGenre.name}` : null,
      artwork.artworkMaterial?.name ? `Material: ${artwork.artworkMaterial.name}` : null,
      artwork.artworkTechnique?.name ? `Technique: ${artwork.artworkTechnique.name}` : null,
      artwork.artworkWorktype?.name ? `Worktype: ${artwork.artworkWorktype.name}` : null,
      artwork.measurements ? `Measurements: ${artwork.measurements}` : null,
    ].filter(part => part !== null);

    const description = descriptionParts.join(', ');

    const formData = new FormData();
    const fileBlob = new Blob([artworkImage.image], { type: artworkImage.mimeType });

    // Append fields and files to the FormData object
    formData.append('file', fileBlob);
    formData.append('name', artwork.name);
    formData.append('metadata', description);

    const response = await fetch(`${url}/trial/mint`, {
      method: 'PUT',
      body: formData
    });

    const { nftID, metadataCid } = await response.json();

    if (nftID != null && metadataCid != null) {
      const collectionIDResponse = await fetch(`${url}/eva/wallet/collection`);
      const collectionID = await collectionIDResponse.text();
  
      const EvaGalleryWalletAddressResponse = await fetch(`${url}/eva/wallet/address`);
      const EvaGalleryWalletAddress = await EvaGalleryWalletAddressResponse.text();

      //replace ipfs://ipfs/ with https://flk-ipfs.xyz/ipfs
      let metadata = metadataCid as string;
      if (metadata.startsWith("ipfs://ipfs/")) {
        metadata = convertIpfsLink(metadata);
      }
      const cidResp = await fetch(metadata);

      const cid = await cidResp.json()

      //also replace ipfs://ipfs/ with https://flk-ipfs.xyz/ipfs
      let image = cid.image as string;
      if (image.startsWith("ipfs://ipfs/")) {
        image = convertIpfsLink(image);
      }
      const nft: NftData = {
        id: `${collectionID}-${nftID}`,
        name: artwork.name,
        description: cid.description,
        image: image,
      }

      await this.nftRepository.trialMint(user.id, artworkId, nft, EvaGalleryWalletAddress);
      return MintStatus.Success;
    }

    return MintStatus.Failed;
  }
} 