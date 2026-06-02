const fetch = global.fetch;

const TOKEN = "LL2462_trk_json:8ba7f969426ebabe5eaf313410cab4ce";

async function test() {
  const response = await fetch(
    "https://blktracksvc.dtdc.com/dtdc-api/rest/JSONCnTrk/getTrackDetails",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": TOKEN
      },
      body: JSON.stringify({
        trkType: "cnno",
        strcnno: "D1015544368",
        addtnlDtl: "Y"
      })
    }
  );

  const text = await response.text();

  console.log("STATUS:", response.status);
  console.log(text);
}

test();