import { Connection, PublicKey } from '@solana/web3.js'
import { parsePriceData } from '@pythnetwork/client'
import { AssetsList, Decimal } from '@synthetify/sdk/lib/exchange'
import { BN } from '@project-serum/anchor'
import { ORACLE_OFFSET } from '@synthetify/sdk'
import { toDecimal } from '@synthetify/sdk/lib/utils'

export class Prices {
  public assetsList: AssetsList
  private connection: Connection

  private constructor(connection: Connection, assetsList: AssetsList) {
    this.connection = connection
    this.assetsList = assetsList

    // Subscribe to oracle updates
    this.assetsList.assets.forEach(({ feedAddress }, index) => {
      connection.onAccountChange(feedAddress, accountInfo => {
        const { price } = parsePriceData(accountInfo.data)
        this.assetsList.assets[index].price = toDecimal(
          new BN(price * 10 ** ORACLE_OFFSET),
          ORACLE_OFFSET
        )
      })
    })
  }

  static async build(connection: Connection, assetsList: AssetsList): Promise<Prices> {
    await Promise.all(
      assetsList.assets.map(async ({ feedAddress }, index) => {
        // don't update the price of usd
        if (index === 0) return

        const account = await connection.getAccountInfo(feedAddress)
        const { price } = parsePriceData(account.data)

        assetsList.assets[index].price = toDecimal(
          new BN(price * 10 ** ORACLE_OFFSET),
          ORACLE_OFFSET
        )
      })
    )

    return new Prices(connection, assetsList)
  }

  async getPrice(address: PublicKey): Promise<Decimal> {
    const foundCollateral = this.assetsList.collaterals.find(({ collateralAddress }) =>
      collateralAddress.equals(address)
    )?.assetIndex

    const foundSynthetic = this.assetsList.synthetics.find(({ assetAddress }) =>
      assetAddress.equals(address)
    )?.assetIndex

    const assetIndex = foundCollateral !== undefined ? foundCollateral : foundSynthetic

    if (assetIndex === undefined) {
      throw new Error(`Could not find price for ${address}`)
    }

    return this.assetsList.assets[assetIndex].price
  }
}
