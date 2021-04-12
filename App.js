const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const SalesTax = require("sales-tax");
const utf8 = require('utf8');
const base64 = require('base-64');

app.use(express.json())

const users = []

app.get('/getUsers', (req, res) => {
  res.json(users)
})

app.post('/signupUser', async (req, res) => {
    try {
      const hashedPassword = await bcrypt.hash(req.body.password, 10)
      const user = { name: req.body.name, password: hashedPassword }
      users.push(user)
      res.status(201).send()
    } catch {
      res.status(500).send()
    }
})

 
/* Request: getSalesTax
  Request Example to get SalesTax
  {"origin_country" : "FR",
  "customer_country: "CA",
  "customer_state": "QC",
  "customer_VAT_number" : "VATXXXX"
  } 
*/
app.post('/getSalesTax', async (req, res) => {
  try {
    let response = await isValidSession(req.headers.authtoken);
    if(response.isValid) {
      let result = await processSalesTax(req);
      if(result.rate !== undefined) {
        let rateInPercent = Number(result.rate) * 100;
        result = {Rate: rateInPercent+"%"};
      }
      return res.json(result);
    } else {
      res.status(401).send(response.message);
    }
  } catch {
    res.status(500).send()
  } finally {
    deallocateOrigin();
  }
})


app.post('/users/login', async (req, res) => {
  const user = users.find(user => user.name === req.body.name)
  if (user == null) {
    return res.status(400).send('Cannot find user')
  }
  try {
    
    if(await bcrypt.compare(req.body.password, user.password)) {
      let authToken = await getAuthToken(user.name, req.body.password);
      res.send({message: 'Success', _authToken : authToken});
    } else {
      res.send('Not Allowed')
    }
  } catch {
    res.status(500).send()
  }
})


processSalesTax = async (req) => {

    let countryCode = req.body.customer_country;
    let stateCode = req.body.customer_state;
    let vatNumber = req.body.customer_VAT_number;
    let originCountry = req.body.origin_country;

    let hasOrigin = originCountry !== undefined &&  originCountry !== "" ? true : false;
    let hasCountry =countryCode  !== undefined &&  countryCode  !== "" ? true : false;
    let hasState =stateCode !== undefined &&  stateCode !== "" ? true : false;
    let hasVatNumber = vatNumber !== undefined &&  vatNumber !== "" ? true : false;

      if(!hasOrigin) {
        return {errorCode: 404, errorMessage: "Origin Country not found !"}
      } 
      else if(!hasCountry) {
        return {errorCode: 404, errorMessage: "Country Code not found !"}
      }
       else {
        await SalesTax.setTaxOriginCountry(originCountry);
      }
  
      if(!hasVatNumber) {
        if(hasState) {
            return await getSalesTaxWithoutVAT(countryCode, stateCode);
        } else {

            return await getSalesTaxWithoutState(countryCode);
        }
      }

      return await getSalesTaxWithVAT(countryCode, stateCode, vatNumber);
}

deallocateOrigin = () => {
  SalesTax.setTaxOriginCountry(null);
}

 getSalesTaxWithoutVAT = async(countryCode, stateCode)=> {
  let result  = await SalesTax.getSalesTax(countryCode, stateCode)
    .then((tax) => {
      return tax;
    }).catch(e => {
      return {errorCode: 500, errorMessage: "Error while fetching tax details without VAT"}
    }); 
    return result;
  }

  getSalesTaxWithoutState = async(countryCode)=> {
    let result  = await SalesTax.getSalesTax(countryCode)
      .then((tax) => {
        return tax;
      }).catch(e => {
        return {errorCode: 500, errorMessage: "Error while fetching tax details without State and VAT"}
      }); 
      return result;
    }
  
  getSalesTaxWithVAT = async(countryCode, stateCode, vatNumber) => {
    if(SalesTax.hasSalesTax(countryCode)) {
      let sCode = SalesTax.hasStateSalesTax(countryCode, stateCode) ? stateCode : null;
      let result = await SalesTax.getSalesTax(countryCode, sCode, vatNumber)
      .then((tax) => {
          return tax;
      }).catch(e => {
        return {errorCode: 500, errorMessage: "Error while fetching tax details"}
      }); 
      return result;
    } else {
      return {errorCode: 404, errorMessage: "Didn't find sales tax for the country "+countryCode}
    }
  }

  getAuthToken = async(user, password)=>{
    const hashedPassword = await bcrypt.hash(password, 10);
    let token = getExpiryTime()+"="+hashedPassword+"="+user;//timestamp+zxcvbnm+user1
    var bytes = await utf8.encode(token);//fddgfvvhgvjhmnhvjhnjbhb
    var encoded = await base64.encode(bytes);//srdgfhjkljhgfdsafghjklhgfdsfghjklhgfdsfghjkljhgfdghj
    return encoded;
  }

  isValidSession = async(encodedToken) => {
    if(encodedToken !== undefined && encodedToken !== null  && encodedToken !== "") {
      var bytes = await base64.decode(encodedToken);
      var token = await utf8.decode(bytes);
      let expiryTime = new Date(Number(token.substring(0, token.indexOf("="))));
      let userName = token.substring(token.lastIndexOf("=")+1);
      const existingUser = users.find(user => user.name === userName);

      if (existingUser == null) {
        return {isValid: false, message: "Invalid authToken. Please check the user you have logged in."};
      } else if(expiryTime > new Date()) {
         return {isValid: true, message: "Success"};
       } else{
         return {isValid: false, message: "Session has expired, Please check your authToken."};
       }
    }
    return {isValid: false, message: "Please provide authToken."};
  }

  getExpiryTime =() => {
    let presentDate = new Date();
    presentDate.setHours(presentDate.getHours()+2);
    return presentDate.getTime();
  }


app.listen(3001)