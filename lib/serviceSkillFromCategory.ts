/** Kategori jasa Fukomo = skill Work. Isi skillName dari nama kategori. */
export async function applySkillNameFromCategory(ServiceCategory: any, body: any) {
    if (!body?.category) return body;
    const cat = await ServiceCategory.findById(body.category).select('name').lean();
    if (cat?.name) body.skillName = String(cat.name).trim();
    return body;
}
