/**
 * Skills Section Component
 * 
 * Displays professional skills and expertise categories.
 */

export function Skills() {
  const skillCategories = [
    {
      title: 'Investment Management',
      skills: ['Portfolio Management', 'Risk Analysis', 'Asset Allocation', 'Market Research']
    },
    {
      title: 'Financial Technology',
      skills: ['Digital Banking', 'Payment Systems', 'Blockchain', 'API Integration']
    },
    {
      title: 'Leadership',
      skills: ['Team Management', 'Strategic Planning', 'Product Development', 'Stakeholder Relations']
    },
    {
      title: 'Technical',
      skills: ['Financial Modeling', 'Data Analysis', 'Programming', 'System Architecture']
    }
  ];

  return (
    <section>
      <h2 className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-lime-500 to-emerald-500 bg-clip-text text-transparent">
        SKILLS
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {skillCategories.map((category) => (
          <div 
            key={category.title}
            className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <h3 className="text-xl font-semibold mb-4">{category.title}</h3>
            <div className="flex flex-wrap gap-2">
              {category.skills.map((skill) => (
                <span
                  key={skill}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}