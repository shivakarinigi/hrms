const { connectToDatabase } = require("../../db/dbConnector");
const { z } = require("zod");

exports.handler = async (event) => {
	const requestBody = JSON.parse(event.body);
	const org_id = "482d8374-fca3-43ff-a638-02c8a425c492";
	const currentTimestamp = new Date().toISOString();

    const requestBodySchema = z.object({
        first_name: z.string().min(3,{message: "first_name must be atleast 3 charachters long"}),
        last_name: z.string().min(3,{message:"last_name must be atleast 3 charachters long"}),
        email: z.string().email(),
        work_email: z.string().email(),
        gender: z.string().min(1),
        dob: z.coerce.date(),
        number: z.string(),
        emergency_number: z.string(),
        highest_qualification: z.string(),
        address_line_1: z.string(),
        address_line_2: z.string(),
        landmark: z.string(),
        country: z.string(),
        state: z.string(),
        city: z.string(),
        zipcode: z.string(),
    });

    const result = requestBodySchema.safeParse(requestBody);
	if (!result.success) {
		return {
			statusCode: 400,
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
			body: JSON.stringify({
				error: result.error.formErrors.fieldErrors,
			}),
		};
	}

	const personalInfoQuery = `
            INSERT INTO employee 
                ( first_name, last_name, email, work_email, gender, dob, number, emergency_number,
                highest_qualification, org_id, invitation_status )
            VALUES
                ($1,$2,$3,$4,$5,$6,$7, $8, $9, $10, $11)
            returning *
            `;
	const empAddressQuery = `
            INSERT INTO address
                (address_line_1, address_line_2, landmark, country, state ,city,zipcode, emp_id)
            VALUES
                ($1,$2,$3,$4,$5,$6,$7, $8)
            returning *
            `;

    const empProfessionalQuery = `
            INSERT INTO emp_detail
                (emp_id, emp_type_id)
            VALUES
                ($1,$2)
            returning *
            `;
	const client = await connectToDatabase();
	await client.query("BEGIN");
	try {
        const personalInfoQueryResult = await new Promise((resolve, reject) => {
            client.query(personalInfoQuery, [
                requestBody.first_name,
                requestBody.last_name,
                requestBody.email,
                requestBody.work_email,
                requestBody.gender,
                requestBody.dob,
                requestBody.number,
                requestBody.emergency_number,
                requestBody.highest_qualification,
                org_id,
                "DRAFT"
            ], (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    
        // Execute the second and third queries in parallel
        const [empAddressQueryResult, empProfessionalQueryResult] = await Promise.all([
            new Promise((resolve, reject) => {
                client.query(empAddressQuery, [
                    requestBody.address_line_1,
                    requestBody.address_line_2,
                    requestBody.landmark,
                    requestBody.country,
                    requestBody.state,
                    requestBody.city,
                    requestBody.zipcode,
                    personalInfoQueryResult.rows[0].id
                ], (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
            }),
            new Promise((resolve, reject) => {
                client.query(empProfessionalQuery, [
                    personalInfoQueryResult.rows[0].id,
                    requestBody.emp_type
                ], (err, res) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(res);
                    }
                });
            })
        ]);
        const dobDate = personalInfoQueryResult.rows[0].dob.toISOString();
        const dobWithoutTime = dobDate.slice(0, 10);
        const res = {
            personalInfoQueryResult: {
                ...personalInfoQueryResult.rows[0],
                id: undefined, 
                dob: dobWithoutTime,
                emp_detail_id: undefined,
                current_task_id: undefined,
                access_token: undefined,
                refresh_token: undefined,
                role_id: undefined,
                invitation_status: undefined,
                org_id: undefined,
                
            },
            empAddressQueryResult: {
                ...empAddressQueryResult.rows[0],
                id: undefined,
                emp_id: undefined,
            },
            empProfessionalQueryResult: {
                ...empProfessionalQueryResult.rows[0],
                id: undefined,
                emp_id: undefined,
                designation_id: undefined,
                reporting_manager_id: undefined,
                emp_type_id: undefined,
                employee_id: undefined,
                
            }
        }
        await client.query("COMMIT");
		return {
            statusCode: 200,
			headers: {
                Access_Control_Allow_Origin: "*",
			},
			body: JSON.stringify({ 
                ...res.personalInfoQueryResult,
                ...res.empAddressQueryResult,
                ...res.empProfessionalQueryResult,
             }),
		};
	} catch (error) {
		await client.query("ROLLBACK");
		return {
			statusCode: 500,
			headers: {
				"Access-Control-Allow-Origin": "*",
			},
			body: JSON.stringify({
				message: error.message,
				error: error,
			}),
		};
	} finally {
        await client.end();
	}
};
