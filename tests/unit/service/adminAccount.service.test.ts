import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDb, connectTestDb } from "../../helpers/db";
import { seedAdmin } from "../../helpers/adminFactory";
import { ADMIN_PAGE_NOTES, ADMIN_PAGE_USERS } from "../../../src/constant/adminPages";
import { AdminAccountService } from "../../../src/service/adminAccount.service";


describe("unit: AdminAccountService", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 120_000);

  beforeEach(async () => {
    await clearTestDb();
  });

  it("login / CRUD / serialize", async () => {
    const { username, password } = await seedAdmin({
      username: "acct-super",
      role: "super",
    });

    await expect(
      AdminAccountService.login("acct-super", "wrong"),
    ).rejects.toThrow(/用户名或密码/);
    const logged = await AdminAccountService.login(username, password);
    expect(logged.token).toBeTruthy();
    expect(logged.admin.role).toBe("super");

    const created = await AdminAccountService.createAdmin({
      username: "acct-normal",
      password: "secret1",
      allowedPages: [ADMIN_PAGE_USERS, "not-a-page"],
    });
    expect(created.role).toBe("admin");

    const listed = await AdminAccountService.listAdmins(1, 10);
    expect(listed.total).toBe(2);
    expect(
      listed.items.find((x) => x.username === "acct-normal")?.rawAllowedPages,
    ).toContain(ADMIN_PAGE_USERS);

    const updated = await AdminAccountService.updateAdmin(String(created._id), {
      password: "secret2",
      allowedPages: [ADMIN_PAGE_NOTES],
      disabled: true,
    });
    expect(updated?.disabled).toBe(true);
    await expect(
      AdminAccountService.login("acct-normal", "secret2"),
    ).rejects.toThrow(/用户名或密码/);

    const pub = AdminAccountService.toPublicAdmin({
      id: "1",
      username: "x",
      role: "admin",
      allowedPages: [ADMIN_PAGE_USERS],
    });
    expect(pub.allowedPages).toContain(ADMIN_PAGE_USERS);

    expect(
      AdminAccountService.validateAssignablePagesInput([
        ADMIN_PAGE_NOTES,
        123,
        "bad",
      ]),
    ).toEqual([ADMIN_PAGE_NOTES]);
    expect(AdminAccountService.validateAssignablePagesInput(null)).toEqual([]);

    const enabledAgain = await AdminAccountService.createAdmin({
      username: "acct-del",
      password: "secret1",
      allowedPages: [ADMIN_PAGE_NOTES],
    });
    expect(await AdminAccountService.deleteAdmin(String(enabledAgain._id))).toBe(
      true,
    );
    expect(await AdminAccountService.deleteAdmin(String(enabledAgain._id))).toBe(
      false,
    );
    await expect(
      AdminAccountService.deleteAdmin(
        String((await seedAdmin({ username: "acct-super-2" })).id),
      ),
    ).rejects.toThrow(/不能删除/);
  });
});


