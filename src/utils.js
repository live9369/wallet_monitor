const dotenv = require('dotenv')
dotenv.config()

async function getBSCNetWorth(_address) {
  const url = `https://pro-openapi.debank.com/v1/user/total_balance?chain_id=bsc&id=${_address}`
  let balance = 0;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': `${process.env.DEBANK_API_KEY}`
      }
    })
    const data = await res.json()
    balance = data.total_usd_value;
  } catch (e) {
    console.error(`❌ 获取${_address}的资产失败: ${e}`)
  }
  return balance;
}

async function getGlobalNetWorth(_dev) {
  const url = `https://pro-openapi.debank.com/v1/user/total_balance?id=${_dev}`
  let balance = 0;
  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': `${process.env.DEBANK_API_KEY}`
      }
    })
    const data = await res.json()
    balance = data.total_usd_value;
  } catch (e) {
    console.error(`❌ 获取${_dev}的资产失败: ${e}`)
  }
  return balance;
}

async function getCexDict(_dev) {
    const url = `https://pro-openapi.debank.com/v1/user/history_list?id=${_dev}&chain_id=bsc`
    let data = null;
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'AccessKey': `${process.env.DEBANK_API_KEY}`
        }
      })
      data = await res.json()
    } catch (e) {
      console.error(`❌ 获取${_dev}的资产失败: ${e}`)
    }
    return data.cex_dict;
}

async function getIsCexDict(_dev) {
    const cexDict = await getCexDict(_dev);
    return Object.keys(cexDict).length !== 0;
}
  

module.exports = {
  getBSCNetWorth,
  getGlobalNetWorth,
  getCexDict,
  getIsCexDict
}

// demo
if (require.main === module) {
//   getBSCNetWorth("0x0B4Dd98C57372870Ae10D800E665209bD625fD48").then(netWorth => {
//     console.log(netWorth);
//   });

//   getDeBankUserInfo('0x8894e0a0c962cb723c1976a4421c95949be2d4e3').then(res => {
//     console.log(res);
//   });

    const address = '0xa1df5a39d5e779592bb76b9484745732e723f9ef';
    getCexDict(address).then(res => {
        console.log(res);
    });
    getIsCexDict(address).then(res => {
        console.log(res);
    });
}